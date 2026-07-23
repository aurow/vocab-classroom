import * as store from './store.js';

async function main() {
  'use strict';

  try {
    await store.init();
  } catch (error) {
    const welcomeCopy = document.querySelector('.welcome-copy');
    if (welcomeCopy) welcomeCopy.textContent = '需要連上網路才能第一次載入，請連網後重新整理。';
    return;
  }

  const welcomeEl = document.getElementById('welcome');
  const appEl = document.getElementById('app');
  const enterBtn = document.getElementById('enter-classroom');

  const boardPanel = document.getElementById('board-panel');
  const boardWord = document.getElementById('board-word');
  const boardMeaning = document.getElementById('board-meaning');
  const boardImageWrap = document.getElementById('board-image-wrap');
  const boardImage = document.getElementById('board-image');
  const boardNav = document.getElementById('board-nav');
  const boardPrevBtn = document.getElementById('board-prev');
  const boardNextBtn = document.getElementById('board-next');
  const speakerBtn = document.getElementById('speaker');
  const mBoardWord = document.getElementById('m-board-word');
  const mSpeakerBtn = document.getElementById('m-speaker');

  const libraryBackdrop = document.getElementById('library-backdrop');
  const openLibraryBtn = document.getElementById('open-library');
  const closeLibraryBtn = document.getElementById('close-library');
  const librarySearch = document.getElementById('library-search');
  const librarySource = document.getElementById('library-source');
  const libraryAlphabetStart = document.getElementById('library-alphabet-start');
  const libraryAlphabetPanel = document.getElementById('library-alphabet-panel');
  const libraryLetterGrid = document.getElementById('library-letter-grid');
  const libraryAlphabetOrder = document.getElementById('library-alphabet-order');
  const libraryAlphabetStats = document.getElementById('library-alphabet-stats');
  const libraryRandomStart = document.getElementById('library-random-start');
  const libraryRandomPanel = document.getElementById('library-random-panel');
  const libraryRandomStats = document.getElementById('library-random-stats');
  const vocabList = document.getElementById('vocab-list');
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  let currentWord = '';
  let latestLoaded = false;
  let searchTimer = null;
  let libraryReturnFocus = null;
  let libraryLetter = '';
  let boardPracticeQueue = [];
  let boardPracticeIndex = 0;
  let boardPracticeFurthestIndex = 0;
  let boardPracticeLabel = '';
  let boardPracticeRandom = false;
  let speechVoices = [];

  function renderInlineMarkdown(text) {
    return text
      .replace(/&lt;br\s*\/?&gt;/gi, '<br>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  function isTableLine(line) {
    return /^\|.*\|$/.test(line);
  }

  function splitTableCells(line) {
    return line.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
  }

  function isSeparatorCells(cells) {
    return cells.every((cell) => /^:?-{2,}:?$/.test(cell) || cell === '');
  }

  function renderTableAsList(rows, out) {
    let headers = null;
    let dataRows = rows;
    if (rows.length >= 2 && isSeparatorCells(rows[1])) {
      headers = rows[0];
      dataRows = rows.slice(2);
    } else {
      dataRows = rows.filter((cells) => !isSeparatorCells(cells));
    }
    for (const cells of dataRows) {
      if (!cells.length) continue;
      out.push(`<div class="md-line">• ${renderInlineMarkdown(cells[0])}</div>`);
      for (let c = 1; c < cells.length; c++) {
        if (!cells[c]) continue;
        const label = headers && headers[c] ? `${renderInlineMarkdown(headers[c])}：` : '';
        out.push(`<div class="md-sub">${label}${renderInlineMarkdown(cells[c])}</div>`);
      }
    }
  }

  function renderMeaningMarkdown(el, text, word) {
    let source = text || '這個單字還沒有說明。';
    // The card UI already shows the word; drop a leading "# word" heading.
    const firstLine = source.split(/\r?\n/, 1)[0].trim();
    const headingText = firstLine.replace(/^#{1,6}\s+/, '').trim();
    if (firstLine !== headingText && word &&
        headingText.toLowerCase() === word.trim().toLowerCase()) {
      source = source.slice(source.indexOf(firstLine) + firstLine.length).replace(/^\s*\r?\n/, '');
    }
    const escaped = source
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const out = [];
    const lines = escaped.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) {
        out.push('<div class="md-gap"></div>');
        continue;
      }
      if (isTableLine(line)) {
        const rows = [];
        while (i < lines.length && isTableLine(lines[i].trim())) {
          rows.push(splitTableCells(lines[i].trim()));
          i++;
        }
        i--;
        renderTableAsList(rows, out);
        continue;
      }
      if (/^-{3,}$/.test(line)) {
        out.push('<hr class="md-hr">');
        continue;
      }
      const heading = line.match(/^(#{1,6})\s+(.*)$/);
      if (heading) {
        const level = Math.min(heading[1].length, 3);
        out.push(`<div class="md-h${level}">${renderInlineMarkdown(heading[2])}</div>`);
        continue;
      }
      out.push(`<div class="md-line">${renderInlineMarkdown(line.replace(/^-\s+/, '• '))}</div>`);
    }
    el.innerHTML = out.join('');
  }

  function refreshSpeechVoices() {
    if ('speechSynthesis' in window) {
      speechVoices = window.speechSynthesis.getVoices();
    }
  }

  refreshSpeechVoices();
  if ('speechSynthesis' in window) {
    window.speechSynthesis.addEventListener('voiceschanged', refreshSpeechVoices);
  }

  function hasEnteredThisTab() {
    try {
      return sessionStorage.getItem('vocab_classroom_entered') === '1';
    } catch (error) {
      return false;
    }
  }

  function markEnteredThisTab() {
    try {
      sessionStorage.setItem('vocab_classroom_entered', '1');
    } catch (error) {
      // The classroom still works when storage is blocked.
    }
  }

  function showApp() {
    markEnteredThisTab();
    welcomeEl.hidden = true;
    appEl.hidden = false;
    if (!latestLoaded) loadLatestWord();
  }

  enterBtn.addEventListener('click', showApp);
  if (hasEnteredThisTab()) showApp();

  function setBoardMessage(title, message) {
    currentWord = '';
    boardWord.textContent = title;
    boardMeaning.textContent = message;
    boardMeaning.classList.add('board-status');
    boardImageWrap.hidden = true;
    boardPanel.classList.remove('has-image');
    boardPanel.setAttribute('aria-busy', 'false');
    speakerBtn.disabled = true;
    mBoardWord.textContent = title;
    mSpeakerBtn.disabled = true;
  }

  function renderWord(item) {
    if (!item) {
      setBoardMessage('黑板還空著', '還沒有單字，從書櫃選一個分類開始複習吧。');
      return;
    }

    currentWord = item.word || '';
    boardWord.textContent = currentWord || '未命名單字';
    renderMeaningMarkdown(boardMeaning, item.meaning, item.word);
    boardMeaning.scrollTop = 0;
    boardMeaning.classList.remove('board-status');
    boardPanel.setAttribute('aria-busy', 'false');
    speakerBtn.disabled = !currentWord || !('speechSynthesis' in window);
    mBoardWord.textContent = currentWord || '未命名單字';
    mSpeakerBtn.disabled = !currentWord || !('speechSynthesis' in window);

    if (item.image_url) {
      boardImage.src = item.image_url;
      boardImage.alt = `${currentWord || '目前單字'}的圖片`;
      boardImageWrap.hidden = false;
      boardPanel.classList.add('has-image');
    } else {
      boardImage.removeAttribute('src');
      boardImage.alt = '';
      boardImageWrap.hidden = true;
      boardPanel.classList.remove('has-image');
    }
  }

  function stopBoardPractice() {
    boardPracticeQueue = [];
    boardPracticeIndex = 0;
    boardPracticeFurthestIndex = 0;
    boardPracticeLabel = '';
    boardPracticeRandom = false;
    boardNav.hidden = true;
    boardPanel.classList.remove('is-practicing');
  }

  function renderBoardPracticeCard() {
    const item = boardPracticeQueue[boardPracticeIndex];
    if (!item) return;
    renderWord(item);
    boardNav.hidden = false;
    boardPrevBtn.disabled = boardPracticeIndex === 0;
    boardNextBtn.disabled = boardPracticeIndex >= boardPracticeQueue.length - 1;
    const progress = `${boardPracticeIndex + 1} / ${boardPracticeQueue.length}`;
    boardPrevBtn.setAttribute('aria-label', `上一個複習單字，目前 ${progress}`);
    boardPrevBtn.title = `上一個複習單字（${progress}）`;
    const nextAction = boardPracticeRandom && boardPracticeIndex < boardPracticeFurthestIndex
      ? '回到下一個已看過的單字'
      : boardPracticeRandom ? '隨機顯示下一個單字' : '下一個複習單字';
    boardNextBtn.setAttribute('aria-label', `${nextAction}，目前 ${progress}`);
    boardNextBtn.title = `${nextAction}（${progress}）`;
  }

  function startBoardPractice(items, label, isRandom) {
    closeLibrary();
    boardPracticeQueue = items;
    boardPracticeIndex = 0;
    boardPracticeFurthestIndex = 0;
    boardPracticeLabel = label;
    boardPracticeRandom = isRandom;
    boardPanel.classList.add('is-practicing');
    renderBoardPracticeCard();
  }

  boardPrevBtn.addEventListener('click', () => {
    if (!boardPracticeQueue.length || boardPracticeIndex === 0) return;
    boardPracticeIndex -= 1;
    renderBoardPracticeCard();
  });

  boardNextBtn.addEventListener('click', () => {
    if (!boardPracticeQueue.length || boardPracticeIndex >= boardPracticeQueue.length - 1) return;
    boardPracticeIndex += 1;
    if (boardPracticeIndex > boardPracticeFurthestIndex) {
      boardPracticeFurthestIndex = boardPracticeIndex;
    }
    renderBoardPracticeCard();
  });

  async function loadLatestWord() {
    stopBoardPractice();
    latestLoaded = true;
    boardPanel.setAttribute('aria-busy', 'true');
    try {
      const item = await store.getLatest();
      renderWord(item);
    } catch (error) {
      latestLoaded = false;
      setBoardMessage('暫時拿不到單字', '讀取時發生問題，請重新整理再試一次。');
    }
  }

  async function loadWord(vocabId) {
    stopBoardPractice();
    boardPanel.setAttribute('aria-busy', 'true');
    try {
      const item = await store.getById(vocabId);
      renderWord(item);
    } catch (error) {
      setBoardMessage('找不到這個單字', '它可能剛剛被移除，請回到書櫃選擇其他單字。');
    }
  }

  const FEMALE_VOICE_HINTS = /female|zira|aria|jenny|michelle|emma|ava|libby|sonia|natasha|hazel|susan|samantha|karen|moira|tessa|serena|fiona|victoria|catherine|google (us english|uk english female)/i;

  function pickTeacherVoice() {
    if (!speechVoices.length) refreshSpeechVoices();
    const english = speechVoices.filter((voice) => /^en[-_]/i.test(voice.lang));
    return english.find((voice) => FEMALE_VOICE_HINTS.test(voice.name)) || english[0] || null;
  }

  function speakWord(text, button) {
    if (!text || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const englishVoice = pickTeacherVoice();
    if (englishVoice) utterance.voice = englishVoice;
    utterance.lang = englishVoice ? englishVoice.lang : 'en-US';
    utterance.rate = 0.86;
    if (button) {
      utterance.onstart = () => {
        button.classList.add('is-speaking');
        button.setAttribute('aria-label', `正在朗讀 ${text}`);
      };
      const reset = () => {
        button.classList.remove('is-speaking');
        button.setAttribute('aria-label', '朗讀目前單字');
      };
      utterance.onend = reset;
      utterance.onerror = reset;
    }
    window.speechSynthesis.speak(utterance);
  }

  speakerBtn.addEventListener('click', () => speakWord(currentWord, speakerBtn));
  mSpeakerBtn.addEventListener('click', () => speakWord(currentWord, mSpeakerBtn));

  if (!('speechSynthesis' in window)) {
    speakerBtn.disabled = true;
    speakerBtn.title = '這個瀏覽器不支援語音朗讀';
    mSpeakerBtn.disabled = true;
    mSpeakerBtn.title = '這個瀏覽器不支援語音朗讀';
    document.getElementById('quiz-speaker').disabled = true;
  }

  async function loadLibrarySources() {
    librarySource.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '請選擇分類';
    librarySource.appendChild(placeholder);
    try {
      const sources = await store.listSources();
      (sources || []).forEach((source) => {
        const option = document.createElement('option');
        option.value = source;
        option.textContent = source;
        librarySource.appendChild(option);
      });
    } catch (error) {
      placeholder.textContent = '暫時讀不到分類';
    }
    libraryAlphabetStart.disabled = !librarySource.value;
    libraryRandomStart.disabled = !librarySource.value;
  }

  async function openLibrary() {
    libraryReturnFocus = document.activeElement;
    libraryBackdrop.hidden = false;
    document.body.style.overflow = 'hidden';
    librarySearch.value = '';
    libraryAlphabetPanel.hidden = true;
    libraryAlphabetStats.hidden = true;
    libraryRandomPanel.hidden = true;
    libraryRandomStats.hidden = true;
    libraryLetter = '';
    await loadLibrarySources();
    loadLibrary('');
    requestAnimationFrame(() => librarySearch.focus());
  }

  function closeLibrary() {
    if (libraryBackdrop.hidden) return;
    libraryBackdrop.hidden = true;
    document.body.style.overflow = '';
    if (libraryReturnFocus && typeof libraryReturnFocus.focus === 'function') {
      libraryReturnFocus.focus();
    }
  }

  function renderLibrary(items) {
    vocabList.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('li');
      empty.className = 'library-message';
      empty.textContent = librarySearch.value.trim() ? '找不到符合的單字。' : '書櫃目前還沒有單字。';
      vocabList.appendChild(empty);
      return;
    }

    items.forEach((item) => {
      const row = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';

      const word = document.createElement('strong');
      word.textContent = item.word || '未命名單字';
      const meta = document.createElement('span');
      meta.className = 'vocab-meta';
      meta.textContent = item.source || item.date_added || '';

      button.append(word, meta);
      button.addEventListener('click', () => {
        closeLibrary();
        loadWord(item.id);
      });
      row.appendChild(button);
      vocabList.appendChild(row);
    });
  }

  async function loadLibrary(query) {
    vocabList.replaceChildren();
    const loading = document.createElement('li');
    loading.className = 'library-message';
    loading.textContent = '正在找書…';
    vocabList.appendChild(loading);
    try {
      const items = await store.search(query, librarySource.value || undefined);
      renderLibrary(items || []);
    } catch (error) {
      loading.textContent = '暫時無法開啟書櫃，請稍後再試。';
    }
  }

  const quizBackdrop = document.getElementById('quiz-backdrop');
  const quizBody = quizBackdrop.querySelector('.quiz-body');
  const closeQuizBtn = document.getElementById('close-quiz');
  const quizProgress = document.getElementById('quiz-progress');
  const quizSetup = document.getElementById('quiz-setup');
  const quizSource = document.getElementById('quiz-source');
  const quizSetupNote = document.getElementById('quiz-setup-note');
  const quizStartBtn = document.getElementById('quiz-start');
  const quizMode = document.getElementById('quiz-mode');
  const quizLetterField = document.getElementById('quiz-letter-field');
  const quizLetter = document.getElementById('quiz-letter');
  const quizProficiencyField = document.getElementById('quiz-proficiency-field');
  const quizProficiency = document.getElementById('quiz-proficiency');
  const quizMessage = document.getElementById('quiz-message');
  const quizCard = document.getElementById('quiz-card');
  const quizWordEl = document.getElementById('quiz-word');
  const quizSpeakerBtn = document.getElementById('quiz-speaker');
  const quizAnswer = document.getElementById('quiz-answer');
  const quizImage = document.getElementById('quiz-image');
  const quizMeaning = document.getElementById('quiz-meaning');
  const quizShowBtn = document.getElementById('quiz-show');
  const quizRevealActions = document.getElementById('quiz-reveal-actions');
  const quizRate = document.getElementById('quiz-rate');
  const quizStatus = document.getElementById('quiz-status');
  const quizReviewNav = document.getElementById('quiz-review-nav');
  const quizReviewPrev = document.getElementById('quiz-review-prev');
  const quizReviewNext = document.getElementById('quiz-review-next');
  const teacherBtn = document.getElementById('teacher-btn');

  let quizQueue = [];
  let quizIndex = 0;
  let quizReturnFocus = null;
  let quizBusy = false;
  let quizScopeLabel = '所有字庫';
  let quizRepeatUnfamiliar = true;
  let quizReviewOnly = false;

  function resetQuizScroll() {
    quizBody.scrollTop = 0;
    quizMeaning.scrollTop = 0;
  }

  function renderAlphabetStats(counts, container, onStart) {
    const options = [
      ['', '全部', counts.total],
      ['mastered', '🟢 精熟', counts.mastered],
      ['normal', '🟡 普通', counts.normal],
      ['unfamiliar', '🔴 不熟', counts.unfamiliar],
    ];
    container.replaceChildren();
    options.forEach(([proficiency, label, count]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'alphabet-stat';
      button.dataset.proficiency = proficiency;
      button.textContent = `${label} ${count}`;
      button.disabled = count === 0;
      button.addEventListener('click', () => onStart(proficiency, label));
      container.appendChild(button);
    });
    container.hidden = false;
  }

  async function selectLibraryLetter(letter, button) {
    libraryLetter = letter;
    libraryLetterGrid.querySelectorAll('button').forEach((item) => {
      item.classList.toggle('is-selected', item === button);
    });
    libraryAlphabetStats.hidden = false;
    libraryAlphabetStats.textContent = '正在統計…';
    try {
      const counts = await store.alphabetStats(librarySource.value, letter);
      renderAlphabetStats(counts, libraryAlphabetStats, startAlphabetPractice);
    } catch (error) {
      libraryAlphabetStats.textContent = '暫時無法讀取統計，請稍後再試。';
    }
  }

  async function startAlphabetPractice(proficiency, proficiencyLabel) {
    try {
      const items = await store.alphabetPractice({
        source: librarySource.value,
        letter: libraryLetter,
        order: libraryAlphabetOrder.value,
        proficiency,
      });
      if (!items || !items.length) return;
      const label = `${librarySource.value}・${libraryLetter} 開頭・${proficiencyLabel}・${libraryAlphabetOrder.value === 'random' ? '隨機' : '依序'}`;
      if (window.matchMedia('(min-width: 768px)').matches) {
        startBoardPractice(items, label, libraryAlphabetOrder.value === 'random');
      } else {
        openPreparedQuiz(items, label);
      }
    } catch (error) {
      libraryAlphabetStats.textContent = '暫時無法開始複習，請稍後再試。';
    }
  }

  async function openRandomStats() {
    libraryRandomStats.hidden = false;
    libraryRandomStats.textContent = '正在統計…';
    try {
      const counts = await store.alphabetStats(librarySource.value);
      renderAlphabetStats(counts, libraryRandomStats, startRandomPractice);
    } catch (error) {
      libraryRandomStats.textContent = '暫時無法讀取統計，請稍後再試。';
    }
  }

  async function startRandomPractice(proficiency, proficiencyLabel) {
    try {
      const items = await store.alphabetPractice({
        source: librarySource.value,
        order: 'random',
        proficiency,
      });
      if (!items || !items.length) return;
      const label = `${librarySource.value}・${proficiencyLabel}・隨機`;
      if (window.matchMedia('(min-width: 768px)').matches) {
        startBoardPractice(items, label, true);
      } else {
        openPreparedQuiz(items, label);
      }
    } catch (error) {
      libraryRandomStats.textContent = '暫時無法開始複習，請稍後再試。';
    }
  }

  ALPHABET.forEach((letter) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = letter;
    button.addEventListener('click', () => selectLibraryLetter(letter, button));
    libraryLetterGrid.appendChild(button);
  });

  function setQuizMessage(text) {
    quizSetup.hidden = true;
    quizMessage.textContent = text;
    quizMessage.hidden = false;
    quizCard.hidden = true;
    quizProgress.textContent = '';
  }

  function showQuizSetup() {
    quizSetup.hidden = false;
    quizMessage.hidden = true;
    quizCard.hidden = true;
    quizProgress.textContent = '';
  }

  function syncQuizModeFields() {
    quizLetterField.hidden = quizMode.value !== 'letter';
    quizProficiencyField.hidden = quizMode.value !== 'proficiency';
  }

  async function loadQuizSources() {
    quizSource.replaceChildren();
    const allOption = document.createElement('option');
    allOption.value = '';
    allOption.textContent = '所有字庫';
    quizSource.appendChild(allOption);
    quizSource.value = '';
    quizSetupNote.textContent = '正在讀取分類…';
    quizStartBtn.disabled = true;
    try {
      const sources = await store.listSources();
      (sources || []).forEach((source) => {
        const option = document.createElement('option');
        option.value = source;
        option.textContent = source;
        quizSource.appendChild(option);
      });
      quizSetupNote.textContent = '只會抽出所選範圍內，今天到期的單字。';
    } catch (error) {
      quizSetupNote.textContent = '暫時讀不到分類，仍可從所有字庫出題。';
    } finally {
      quizStartBtn.disabled = false;
    }
  }

  ALPHABET.forEach((letter) => {
    const option = document.createElement('option');
    option.value = letter;
    option.textContent = letter;
    quizLetter.appendChild(option);
  });

  function renderQuizCard() {
    const item = quizQueue[quizIndex];
    if (!item) {
      setQuizMessage(quizReviewOnly ? '複習完囉！' : '恭喜！今天的任務都達成囉！');
      return;
    }
    quizMessage.hidden = true;
    quizCard.hidden = false;
    quizProgress.textContent = `${quizIndex + 1} / ${quizQueue.length}`;
    quizWordEl.textContent = item.word || '未命名單字';
    quizStatus.textContent = '';
    if (quizReviewOnly) {
      renderQuizAnswerContent(item);
      quizAnswer.hidden = false;
      quizRevealActions.hidden = true;
      quizRate.hidden = true;
      quizReviewNav.hidden = false;
      quizReviewPrev.disabled = quizIndex === 0;
      quizReviewNext.disabled = quizIndex >= quizQueue.length - 1;
    } else {
      quizAnswer.hidden = true;
      quizRevealActions.hidden = false;
      quizRate.hidden = true;
      quizReviewNav.hidden = true;
    }
    resetQuizScroll();
    speakWord(item.word || '', quizSpeakerBtn);
  }

  quizSpeakerBtn.addEventListener('click', () => {
    const item = quizQueue[quizIndex];
    if (item) speakWord(item.word || '', quizSpeakerBtn);
  });

  function renderQuizAnswerContent(item) {
    renderMeaningMarkdown(quizMeaning, item.meaning, item.word);
    if (item.image_url) {
      quizImage.src = item.image_url;
      quizImage.alt = `${item.word || '目前單字'}的圖片`;
      quizImage.hidden = false;
    } else {
      quizImage.removeAttribute('src');
      quizImage.alt = '';
      quizImage.hidden = true;
    }
  }

  function showQuizAnswer() {
    const item = quizQueue[quizIndex];
    if (!item) return;
    renderQuizAnswerContent(item);
    resetQuizScroll();
    quizAnswer.hidden = false;
    quizRevealActions.hidden = true;
    quizRate.hidden = false;
  }

  async function rateQuiz(rating) {
    if (quizBusy) return;
    const item = quizQueue[quizIndex];
    if (!item) return;
    quizBusy = true;
    quizRate.querySelectorAll('button').forEach((btn) => { btn.disabled = true; });
    try {
      await store.review(item.id, rating);
      if (rating === 'again' && quizRepeatUnfamiliar) quizQueue.push(item);
      quizIndex += 1;
      renderQuizCard();
    } catch (error) {
      quizStatus.textContent = '資料庫使用中，請再按一次。';
    } finally {
      quizBusy = false;
      quizRate.querySelectorAll('button').forEach((btn) => { btn.disabled = false; });
    }
  }

  async function startQuiz() {
    quizQueue = [];
    quizIndex = 0;
    quizReviewOnly = false;
    const source = quizSource.value;
    const mode = quizMode.value;
    quizScopeLabel = source || '所有字庫';
    quizRepeatUnfamiliar = mode === 'weighted';
    setQuizMessage('老師正在準備題目…');
    let letter;
    let proficiency;
    if (mode === 'letter') {
      letter = quizLetter.value;
      quizScopeLabel += `・${quizLetter.value} 開頭`;
    } else if (mode === 'proficiency') {
      proficiency = quizProficiency.value;
      const labels = { unfamiliar: '不熟', normal: '普通', mastered: '精熟' };
      quizScopeLabel += `・${labels[quizProficiency.value]}`;
    }
    try {
      const items = await store.getDue({ source: source || undefined, letter, proficiency });
      quizQueue = items || [];
    } catch (error) {
      if (!quizBackdrop.hidden) setQuizMessage('暫時拿不到題目，請關閉後再點一次老師重試。');
      return;
    }
    if (quizBackdrop.hidden) return;
    if (!quizQueue.length) {
      setQuizMessage(`「${quizScopeLabel}」今天沒有需要複習的單字。`);
      return;
    }
    renderQuizCard();
  }

  function skipQuiz() {
    if (quizBusy || !quizQueue[quizIndex]) return;
    quizIndex += 1;
    renderQuizCard();
  }

  function openPreparedQuiz(items, label) {
    closeLibrary();
    quizReturnFocus = openLibraryBtn;
    quizBackdrop.hidden = false;
    document.body.style.overflow = 'hidden';
    quizQueue = items;
    quizIndex = 0;
    quizScopeLabel = label;
    quizRepeatUnfamiliar = false;
    quizReviewOnly = true;
    quizSetup.hidden = true;
    renderQuizCard();
  }

  async function openQuiz() {
    quizReturnFocus = document.activeElement;
    quizBackdrop.hidden = false;
    document.body.style.overflow = 'hidden';
    quizQueue = [];
    quizIndex = 0;
    quizMode.value = 'weighted';
    syncQuizModeFields();
    showQuizSetup();
    await loadQuizSources();
    if (!quizBackdrop.hidden) quizSource.focus();
  }

  function closeQuiz() {
    if (quizBackdrop.hidden) return;
    quizBackdrop.hidden = true;
    document.body.style.overflow = '';
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (quizReturnFocus && typeof quizReturnFocus.focus === 'function') {
      quizReturnFocus.focus();
    }
  }

  teacherBtn.addEventListener('click', openQuiz);
  quizStartBtn.addEventListener('click', startQuiz);
  quizMode.addEventListener('change', syncQuizModeFields);
  closeQuizBtn.addEventListener('click', closeQuiz);
  quizBackdrop.addEventListener('click', (event) => {
    if (event.target === quizBackdrop) closeQuiz();
  });
  quizShowBtn.addEventListener('click', showQuizAnswer);
  document.getElementById('rate-again').addEventListener('click', () => rateQuiz('again'));
  document.getElementById('rate-good').addEventListener('click', () => rateQuiz('good'));
  document.getElementById('rate-easy').addEventListener('click', () => rateQuiz('easy'));
  document.getElementById('quiz-skip').addEventListener('click', skipQuiz);
  document.getElementById('quiz-skip-before').addEventListener('click', skipQuiz);
  quizReviewPrev.addEventListener('click', () => {
    if (quizIndex === 0) return;
    quizIndex -= 1;
    renderQuizCard();
  });
  quizReviewNext.addEventListener('click', () => {
    if (quizIndex >= quizQueue.length - 1) return;
    quizIndex += 1;
    renderQuizCard();
  });
  document.getElementById('m-teacher').addEventListener('click', openQuiz);
  document.getElementById('m-bookcase').addEventListener('click', openLibrary);

  const memoryBackdrop = document.getElementById('memory-backdrop');
  const openMemoryBtn = document.getElementById('open-memory-card');
  const closeMemoryBtn = document.getElementById('close-memory');
  const memoryMessage = document.getElementById('memory-message');
  const memoryContent = document.getElementById('memory-content');
  const memoryWord = document.getElementById('memory-word');
  const memoryAnswer = document.getElementById('memory-answer');
  const memoryImage = document.getElementById('memory-image');
  const memoryMeaning = document.getElementById('memory-meaning');
  const memoryShowBtn = document.getElementById('memory-show');
  const memoryNextBtn = document.getElementById('memory-next');
  const memorySource = document.getElementById('memory-source');
  let memoryReturnFocus = null;

  async function loadMemorySources() {
    const previous = memorySource.value;
    memorySource.replaceChildren();
    const allOption = document.createElement('option');
    allOption.value = '';
    allOption.textContent = '所有分類';
    memorySource.appendChild(allOption);
    try {
      const sources = await store.unfamiliarSources();
      (sources || []).forEach((entry) => {
        const option = document.createElement('option');
        option.value = entry.source;
        if (entry.count > 0) {
          option.textContent = `${entry.source} (${entry.count})`;
        } else {
          option.textContent = `${entry.source}（無不熟字）`;
          option.disabled = true;
        }
        memorySource.appendChild(option);
      });
    } catch (error) {
      // 讀不到分類時仍可用「所有分類」複習
    }
    const stillValid = Array.from(memorySource.options).some(
      (option) => option.value === previous && !option.disabled
    );
    memorySource.value = stillValid ? previous : '';
  }

  async function loadMemoryCard() {
    memoryMessage.hidden = false;
    memoryMessage.textContent = '正在抽一張小卡…';
    memoryContent.hidden = true;
    try {
      const source = memorySource.value;
      const item = await store.randomUnfamiliar(source || undefined);
      if (!item) {
        memoryMessage.textContent = source
          ? '這個分類目前沒有不熟的單字。'
          : '目前還沒有曾經勾選「不熟」的單字。先請老師出題吧！';
        return;
      }
      memoryWord.textContent = item.word || '未命名單字';
      renderMeaningMarkdown(memoryMeaning, item.meaning, item.word);
      if (item.image_url) {
        memoryImage.src = item.image_url;
        memoryImage.alt = `${item.word || '目前單字'}的圖片`;
        memoryImage.hidden = false;
      } else {
        memoryImage.removeAttribute('src');
        memoryImage.alt = '';
        memoryImage.hidden = true;
      }
      memoryAnswer.hidden = true;
      memoryShowBtn.hidden = false;
      memoryMessage.hidden = true;
      memoryContent.hidden = false;
    } catch (error) {
      memoryMessage.textContent = '暫時抽不到單字卡，請稍後再試。';
    }
  }

  async function openMemoryCard() {
    memoryReturnFocus = document.activeElement;
    memoryBackdrop.hidden = false;
    document.body.style.overflow = 'hidden';
    await loadMemorySources();
    loadMemoryCard();
  }

  function closeMemoryCard() {
    if (memoryBackdrop.hidden) return;
    memoryBackdrop.hidden = true;
    document.body.style.overflow = '';
    if (memoryReturnFocus && typeof memoryReturnFocus.focus === 'function') {
      memoryReturnFocus.focus();
    }
  }

  openMemoryBtn.addEventListener('click', openMemoryCard);
  closeMemoryBtn.addEventListener('click', closeMemoryCard);
  memoryBackdrop.addEventListener('click', (event) => {
    if (event.target === memoryBackdrop) closeMemoryCard();
  });
  memoryShowBtn.addEventListener('click', () => {
    memoryAnswer.hidden = false;
    memoryShowBtn.hidden = true;
  });
  memoryNextBtn.addEventListener('click', loadMemoryCard);
  memorySource.addEventListener('change', loadMemoryCard);

  openLibraryBtn.addEventListener('click', openLibrary);
  closeLibraryBtn.addEventListener('click', closeLibrary);
  libraryBackdrop.addEventListener('click', (event) => {
    if (event.target === libraryBackdrop) closeLibrary();
  });
  librarySearch.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => loadLibrary(librarySearch.value), 220);
  });
  librarySource.addEventListener('change', () => {
    libraryAlphabetStart.disabled = !librarySource.value;
    libraryRandomStart.disabled = !librarySource.value;
    libraryAlphabetPanel.hidden = true;
    libraryAlphabetStats.hidden = true;
    libraryRandomPanel.hidden = true;
    libraryRandomStats.hidden = true;
    libraryLetter = '';
    libraryLetterGrid.querySelectorAll('button').forEach((button) => {
      button.classList.remove('is-selected');
    });
    loadLibrary(librarySearch.value);
  });
  libraryAlphabetStart.addEventListener('click', () => {
    if (!librarySource.value) return;
    libraryAlphabetPanel.hidden = !libraryAlphabetPanel.hidden;
  });
  libraryRandomStart.addEventListener('click', () => {
    if (!librarySource.value) return;
    libraryRandomPanel.hidden = !libraryRandomPanel.hidden;
    if (!libraryRandomPanel.hidden) openRandomStats();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (!memoryBackdrop.hidden) { closeMemoryCard(); return; }
      if (!quizBackdrop.hidden) { closeQuiz(); return; }
      closeLibrary();
      return;
    }
    const activeOverlay = [memoryBackdrop, quizBackdrop, libraryBackdrop].find((el) => !el.hidden);
    if (event.key !== 'Tab' || !activeOverlay) return;
    const focusable = activeOverlay.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), select:not([disabled])'
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  async function doExport() {
    const blob = await store.exportData();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vocab-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    const rem = document.getElementById('backup-reminder');
    if (rem) rem.hidden = true;
  }
  document.getElementById('backup-export').addEventListener('click', doExport);
  document.getElementById('backup-reminder-export').addEventListener('click', doExport);
  document.getElementById('backup-reminder-dismiss').addEventListener('click', () => {
    document.getElementById('backup-reminder').hidden = true;
  });
  document.getElementById('backup-import').addEventListener('click', () => document.getElementById('backup-file').click());
  document.getElementById('backup-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm('匯入會覆蓋目前的進度，確定？')) { e.target.value = ''; return; }
    const text = await file.text();
    try {
      const { count } = await store.importData(text);
      alert(`已匯入 ${count} 筆，重新整理套用。`);
      location.reload();
    } catch (err) {
      alert('匯入失敗：檔案格式不正確。');
    } finally {
      e.target.value = '';
    }
  });

  window.__ready = true;
  window.__store = store;

  try {
    const rem = await store.backupReminder();
    if (rem.show) {
      document.getElementById('backup-reminder-text').textContent =
        `已經 ${rem.days} 天沒備份了，建議匯出一份存到雲端，換手機或被清掉時才救得回。`;
      document.getElementById('backup-reminder').hidden = false;
    }
  } catch (_) { /* non-critical */ }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js');
  }
}
main();
