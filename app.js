(() => {
  "use strict";

  const CONFIG = window.BANK_CONFIG || {};
  const QUESTIONS = window.QUESTION_BANK || [];
  const STORAGE_KEY = CONFIG.storageKey || "weiji-question-bank-v1";
  const PAGE_SIZE = 30;
  const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const TYPE_LABELS = { boolean: "判断题", single: "单选题", multiple: "多选题" };
  const $ = (id) => document.getElementById(id);
  const unique = (items) => [...new Set(items)];
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const blankRecord = () => ({ selected: [], submitted: false, correct: false, bookmarked: false, attempts: 0 });

  const loadProgress = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return saved && typeof saved === "object" ? saved : {};
    } catch {
      return {};
    }
  };

  const state = { view: "practice", chapter: "全部", sourceType: "all", index: 0, mapPage: 0, progress: loadProgress() };

  const recordFor = (id) => {
    if (!state.progress[id]) state.progress[id] = blankRecord();
    return state.progress[id];
  };

  const saveProgress = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
      $("syncText").textContent = "刚刚已保存";
      clearTimeout(saveProgress.timer);
      saveProgress.timer = setTimeout(() => { $("syncText").textContent = "本地自动保存"; }, 1600);
    } catch {
      $("syncText").textContent = "本地保存不可用";
    }
  };

  const filteredQuestions = () => QUESTIONS.filter((question) => {
    const chapterMatch = state.chapter === "全部" || question.category === state.chapter;
    const typeMatch = state.sourceType === "all" || question.sourceType === state.sourceType;
    const record = recordFor(question.id);
    if (state.view === "wrong") return chapterMatch && typeMatch && record.submitted && !record.correct;
    if (state.view === "bookmarks") return chapterMatch && typeMatch && record.bookmarked;
    return chapterMatch && typeMatch;
  });

  const currentQuestion = () => {
    const list = filteredQuestions();
    if (!list.length) return null;
    state.index = Math.max(0, Math.min(state.index, list.length - 1));
    return list[state.index];
  };

  const allStats = () => {
    const records = QUESTIONS.map((question) => recordFor(question.id));
    const submitted = records.filter((record) => record.submitted);
    return {
      completed: submitted.length,
      correct: submitted.filter((record) => record.correct).length,
      wrong: submitted.filter((record) => !record.correct).length,
      bookmarks: records.filter((record) => record.bookmarked).length
    };
  };

  const configurePage = () => {
    document.title = CONFIG.documentTitle || "卫基题库";
    $("brandMark").textContent = CONFIG.brandMark || "卫";
    $("brandTitle").textContent = CONFIG.title || "卫基题库";
    $("brandScope").textContent = CONFIG.shortScope || "题本 PDF";
    $("scopeTitle").textContent = CONFIG.scopeTitle || "题本与答案 PDF";
    $("scopeText").textContent = CONFIG.scopeText || "原题原答案录入，并标注 PDF 页码。";
    $("breadcrumb").textContent = CONFIG.breadcrumb || "2026 四川省属 / 卫基";
  };

  const renderNavigation = () => {
    document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("is-active", button.dataset.view === state.view));
    const stats = allStats();
    $("wrongCount").textContent = stats.wrong;
    $("bookmarkCount").textContent = stats.bookmarks;
    $("pageTitle").textContent = ({ practice: "章节练习", wrong: "错题复习", bookmarks: "重点收藏" })[state.view];
  };

  const renderFilters = () => {
    const categories = unique(QUESTIONS.map((question) => question.category));
    const container = $("chapterFilters");
    container.innerHTML = ["全部", ...categories].map((category) => `<button class="filter-chip${state.chapter === category ? " is-selected" : ""}" data-chapter="${escapeHtml(category)}" type="button">${escapeHtml(category)}</button>`).join("");
    container.querySelectorAll("[data-chapter]").forEach((button) => button.addEventListener("click", () => {
      state.chapter = button.dataset.chapter;
      state.index = 0;
      state.mapPage = 0;
      render();
    }));
    $("modeSelect").value = state.sourceType;
    $("modeSelect").onchange = (event) => {
      state.sourceType = event.target.value;
      state.index = 0;
      state.mapPage = 0;
      render();
    };
    $("poolLabel").textContent = `${filteredQuestions().length} 道题`;
  };

  const renderMetrics = () => {
    const stats = allStats();
    const total = QUESTIONS.length;
    const accuracy = stats.completed ? `${Math.round(stats.correct / stats.completed * 100)}%` : "--";
    $("completedNumber").textContent = stats.completed;
    $("totalNumber").textContent = `/ ${total}`;
    $("accuracyNumber").textContent = accuracy;
    $("reviewNumber").textContent = stats.wrong;
    const percent = total ? Math.round(stats.completed / total * 100) : 0;
    $("overallPercent").textContent = `${percent}%`;
    $("progressBar").style.width = `${percent}%`;
    const list = filteredQuestions();
    const records = list.map((question) => recordFor(question.id));
    const done = records.filter((record) => record.submitted).length;
    const correct = records.filter((record) => record.submitted && record.correct).length;
    const wrong = records.filter((record) => record.submitted && !record.correct).length;
    const sessionPercent = list.length ? Math.round(done / list.length * 100) : 0;
    $("sessionPercent").textContent = `${sessionPercent}%`;
    $("sessionBar").style.width = `${sessionPercent}%`;
    $("railDone").textContent = done;
    $("railCorrect").textContent = correct;
    $("railWrong").textContent = wrong;
  };

  const renderOptionStates = (question, record) => {
    if (!record.submitted) return;
    const answerSet = new Set(question.answer);
    document.querySelectorAll("#optionsList .option").forEach((option) => {
      const index = Number(option.dataset.option);
      const selected = record.selected.includes(index);
      if (answerSet.has(index)) option.classList.add(selected ? "is-correct" : "is-missed");
      else if (selected) option.classList.add("is-wrong");
    });
  };

  const renderFeedback = (question, record) => {
    const feedback = $("feedback");
    feedback.hidden = !record.submitted;
    feedback.classList.toggle("is-wrong", record.submitted && !record.correct);
    if (!record.submitted) return;
    $("feedbackIcon").textContent = record.correct ? "✓" : "!";
    $("feedbackTitle").textContent = record.correct ? "回答正确" : "需要复习";
    $("feedbackText").textContent = record.correct ? "已按附件答案判定正确。" : `正确答案：${question.answer.map((index) => LETTERS[index]).join("、")}。已加入错题复习。`;
    $("explanation").textContent = question.explanation;
  };

  const renderQuestion = () => {
    const list = filteredQuestions();
    const question = currentQuestion();
    const empty = !question;
    $("questionCard").hidden = empty;
    $("emptyState").hidden = !empty;
    if (empty) {
      $("emptyTitle").textContent = state.view === "wrong" ? "错题已经清空" : state.view === "bookmarks" ? "还没有收藏题" : "当前筛选没有题目";
      $("emptyText").textContent = state.view === "wrong" ? "答错的题会自动出现在这里。" : state.view === "bookmarks" ? "收藏需要反复回看的题目。" : "换一个章节或题型继续练习。";
      $("submitButton").hidden = true;
      return;
    }
    const record = recordFor(question.id);
    const submitted = record.submitted;
    const displayType = question.sourceType === "single" && question.type === "multiple" ? "单选题（附件给出多项答案）" : question.sourceTypeLabel;
    $("chapterTag").textContent = question.category;
    $("typeTag").textContent = displayType;
    $("questionKicker").textContent = `QUESTION ${String(state.index + 1).padStart(3, "0")}`;
    $("questionSource").textContent = question.source;
    $("questionStem").textContent = question.stem;
    $("questionHint").textContent = question.type === "multiple" ? "选择全部正确选项后提交" : "选择后立即判分";
    $("memoryTip").textContent = question.sourceType === "boolean" ? "判断题按附件答案判分，注意题干中的绝对化表述。" : "先看限定词，再核对数字、部位、机制与因果方向。";
    $("bookmarkButton").classList.toggle("is-saved", record.bookmarked);
    $("bookmarkIcon").textContent = record.bookmarked ? "★" : "☆";
    $("bookmarkText").textContent = record.bookmarked ? "已收藏" : "收藏";
    $("optionsList").innerHTML = question.options.map((option, optionIndex) => {
      const checked = record.selected.includes(optionIndex) ? " checked" : "";
      const disabled = submitted ? " disabled" : "";
      return `<div class="option" data-option="${optionIndex}"><input id="${question.id}-${optionIndex}" name="${question.id}" type="${question.type === "single" ? "radio" : "checkbox"}" value="${optionIndex}"${checked}${disabled}><label for="${question.id}-${optionIndex}"><span class="option-letter">${LETTERS[optionIndex]}</span><span>${escapeHtml(option)}</span></label></div>`;
    }).join("");
    $("optionsList").querySelectorAll("input").forEach((input) => input.addEventListener("change", () => onSelect(question, Number(input.value))));
    renderOptionStates(question, record);
    renderFeedback(question, record);
    $("submitButton").hidden = question.type !== "multiple" || submitted;
    $("submitButton").disabled = !record.selected.length;
    $("prevButton").disabled = state.index === 0;
    $("nextButton").disabled = state.index >= list.length - 1;
    $("saveStatus").textContent = submitted ? (record.correct ? "已记录 · 答对" : "已记录 · 加入错题") : (question.type === "single" ? "选择后立即判分" : "选择全部答案后提交");
  };

  const renderMap = () => {
    const list = filteredQuestions();
    const start = state.mapPage * PAGE_SIZE;
    const visible = list.slice(start, start + PAGE_SIZE);
    $("questionMap").innerHTML = visible.map((question, offset) => {
      const record = recordFor(question.id);
      const classes = ["map-button", state.index === start + offset ? "is-current" : "", record.submitted ? "is-done" : "", record.submitted && !record.correct ? "is-wrong" : ""].filter(Boolean).join(" ");
      return `<button class="${classes}" data-map-index="${start + offset}" type="button">${start + offset + 1}</button>`;
    }).join("");
    $("mapCount").textContent = `${list.length} 道`;
    $("mapRange").textContent = list.length ? `${start + 1}-${Math.min(start + PAGE_SIZE, list.length)}` : "0-0";
    $("mapPrev").disabled = state.mapPage === 0;
    $("mapNext").disabled = start + PAGE_SIZE >= list.length;
    $("questionMap").querySelectorAll("[data-map-index]").forEach((button) => button.addEventListener("click", () => {
      state.index = Number(button.dataset.mapIndex);
      state.mapPage = Math.floor(state.index / PAGE_SIZE);
      renderQuestion();
      renderMap();
    }));
  };

  const submitAnswer = (question) => {
    const record = recordFor(question.id);
    if (record.submitted || !record.selected.length) return;
    record.submitted = true;
    record.attempts += 1;
    const selected = [...record.selected].sort((a, b) => a - b);
    record.correct = selected.length === question.answer.length && selected.every((value, index) => value === question.answer[index]);
    saveProgress();
  };

  const onSelect = (question, optionIndex) => {
    const record = recordFor(question.id);
    if (record.submitted) return;
    if (question.type === "single") {
      record.selected = [optionIndex];
      submitAnswer(question);
    } else {
      record.selected = [...new Set(record.selected.includes(optionIndex) ? record.selected.filter((index) => index !== optionIndex) : [...record.selected, optionIndex])].sort((a, b) => a - b);
      saveProgress();
    }
    render();
  };

  const moveQuestion = (delta) => {
    const list = filteredQuestions();
    if (!list.length) return;
    state.index = Math.max(0, Math.min(list.length - 1, state.index + delta));
    state.mapPage = Math.floor(state.index / PAGE_SIZE);
    renderQuestion();
    renderMap();
  };

  const render = () => {
    renderNavigation();
    renderFilters();
    renderMetrics();
    renderQuestion();
    renderMap();
  };

  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => {
    state.view = button.dataset.view;
    state.index = 0;
    state.mapPage = 0;
    render();
  }));
  $("prevButton").addEventListener("click", () => moveQuestion(-1));
  $("nextButton").addEventListener("click", () => moveQuestion(1));
  $("submitButton").addEventListener("click", () => {
    const question = currentQuestion();
    if (question) {
      submitAnswer(question);
      render();
    }
  });
  $("bookmarkButton").addEventListener("click", () => {
    const question = currentQuestion();
    if (!question) return;
    const record = recordFor(question.id);
    record.bookmarked = !record.bookmarked;
    saveProgress();
    render();
  });
  $("mapPrev").addEventListener("click", () => {
    state.mapPage -= 1;
    state.index = state.mapPage * PAGE_SIZE;
    renderQuestion();
    renderMap();
  });
  $("mapNext").addEventListener("click", () => {
    state.mapPage += 1;
    state.index = state.mapPage * PAGE_SIZE;
    renderQuestion();
    renderMap();
  });
  $("resetProgress").addEventListener("click", () => {
    QUESTIONS.forEach((question) => {
      if (state.chapter === "全部" || question.category === state.chapter) delete state.progress[question.id];
    });
    state.index = 0;
    state.mapPage = 0;
    saveProgress();
    render();
  });

  configurePage();
  render();
})();
