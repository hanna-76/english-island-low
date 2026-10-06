/* ============================================================
 * game-listening.js —— 听音找图游戏模块
 *
 * 适用年龄：3~5 岁（也可作为 6~8 岁的基础玩法）
 * 游戏规则：
 *   1. 系统播放一个英文单词的发音
 *   2. 屏幕上显示 2~4 张 emoji 图片作为选项
 *   3. 儿童点击认为正确的图片
 *   4. 答对：图片变绿，播放鼓励语音，1秒后进入下一题
 *   5. 答错：图片变红，播放"再试一次"，高亮正确答案，2秒后进入下一题
 *   6. 无倒计时，不扣分，允许无限次重播
 *
 * 难度等级：
 *   easy   —— 每题 2 张图（最简单，适合 3~5 岁）
 *   normal —— 每题 3 张图（中档默认）
 *   hard   —— 每题 4 张图（高档挑战）
 * ============================================================ */

const GameListening = {

  /* ----------------------------------------------------------
   * 游戏状态变量
   * ---------------------------------------------------------- */
  questions: [],   // 本轮的题目数组（从主题词表中随机抽取的单词对象）
  index: 0,        // 当前题号（从 0 开始，显示时 +1）
  correct: 0,      // 本轮答对的题数
  theme: null,     // 当前主题对象（包含 id/name/icon/words）
  level: "easy",   // 难度等级：easy / normal / hard
  onFinish: null,  // 游戏结束回调函数，签名 (correct, total) => void
  locked: false,   // 答题锁：防止一题内重复点击
  timer: null,     // 定时器ID：用于清除旧的 setTimeout，避免多次触发 next()

  /* ----------------------------------------------------------
   * start(theme, level, onFinish)
   * 开始一轮听音找图游戏。
   * 做以下初始化：
   *   1. 保存主题、难度、结束回调
   *   2. 重置当前题号、答对数、答题锁
   *   3. 清除可能残留的定时器
   *   4. 从主题词表中随机抽取 10 个单词作为题目
   *   5. 渲染第一道题
   * ---------------------------------------------------------- */
  start(theme, level, onFinish) {
    this.theme = theme;
    this.level = level;
    this.onFinish = onFinish;
    this.index = 0;
    this.correct = 0;
    this.locked = false;
    // 清除可能残留的定时器
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }

    // 从主题词表中随机抽取 10 道题（不重复）
    const wordPool = theme.words;
    this.questions = sample(wordPool, Math.min(10, wordPool.length));

    this.renderQuestion();
  },

  /* ----------------------------------------------------------
   * optionCount()
   * 根据当前难度等级，返回每题应该显示的图片选项数量。
   * easy→2张, normal→3张, hard→4张
   * ---------------------------------------------------------- */
  optionCount() {
    if (this.level === "easy")   return 2;
    if (this.level === "normal") return 3;
    return 4;
  },

  /* ----------------------------------------------------------
   * renderQuestion()
   * 渲染当前这道题的完整界面。
   * 界面包含：中文提示 + 重播按钮 + 图片选项网格
   * 自动播放单词发音。
   * 选项生成：正确答案 + 干扰项，打乱顺序。
   * ---------------------------------------------------------- */
  renderQuestion() {
    // 每题开始时解锁，允许点击
    this.locked = false;

    const q = this.questions[this.index];
    const total = this.questions.length;

    // 更新顶部进度条
    App.showProgress(this.index + 1, total);

    // 渲染题目区域
    const stage = document.getElementById("stage");
    stage.innerHTML = `
      <div class="q-hint">
        <p class="q-cn">${q.en}</p>
        <button class="btn-replay" id="btnReplay" aria-label="重播发音">
          🔊 再听一次
        </button>
      </div>
      <div class="img-options" id="imgOptions"></div>
    `;

    // 自动播放单词发音
    AudioManager.speak(q.en);

    // 绑定重播按钮
    document.getElementById("btnReplay").onclick = () => {
      AudioManager.speak(q.en);
    };

    // 生成干扰项：从同主题排除正确答案后随机抽 (选项数-1) 个
    const distractors = sample(
      this.theme.words.filter(w => w.en !== q.en),
      this.optionCount() - 1
    );
    // 合并正确答案和干扰项，打乱顺序
    const options = shuffle([q, ...distractors]);

    // 渲染每个图片选项卡片（颜色主题显示颜色块，其他显示emoji）
    const box = document.getElementById("imgOptions");
    box.innerHTML = "";
    options.forEach(opt => {
      const btn = document.createElement("button");
      btn.className = "img-card";
      btn.innerHTML = renderWordImage(opt);
      btn.onclick = () => this.handlePick(btn, opt, q);
      box.appendChild(btn);
    });
  },

  /* ----------------------------------------------------------
   * handlePick(btnEl, picked, answer)
   * 处理儿童点击图片选项后的逻辑。
   *
   * 关键修复：
   *   - 用 locked 变量防止一题内重复点击
   *   - 每次设置新定时器前清除旧定时器，避免多次触发 next()
   *   - 答错后禁用所有卡片，高亮正确答案，2秒后自动下一题
   *
   * 答对处理：
   *   1. 答对数+1，卡片变绿
   *   2. 播放鼓励语音
   *   3. 上锁，禁用所有卡片
   *   4. 如果该词之前在错题本里，自动移除
   *   5. 1秒后进入下一题
   *
   * 答错处理：
   *   1. 卡片变红
   *   2. 记入错题本
   *   3. 播放提示语音
   *   4. 上锁，禁用所有卡片
   *   5. 0.8秒后高亮正确答案（绿框）并重播发音
   *   6. 2秒后进入下一题
   * ---------------------------------------------------------- */
  handlePick(btnEl, picked, answer) {
    // 如果已经答过这题（上锁中），忽略点击
    if (this.locked) return;
    // 立即上锁，防止重复点击
    this.locked = true;

    // 清除可能存在的旧定时器
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }

    const isCorrect = picked.en === answer.en;

    if (isCorrect) {
      // ===== 答对 =====
      this.correct++;
      btnEl.classList.add("right");
      AudioManager.speak("correct! great job!");
      // 如果该词之前在错题本里，答对后自动移除
      if (Store.removeWrong) Store.removeWrong(answer.en);
      // 禁用所有选项卡片，防止重复点击
      this.disableAllCards();
      // 1秒后进入下一题
      this.timer = setTimeout(() => this.next(), 1000);
    } else {
      // ===== 答错 =====
      btnEl.classList.add("wrong");
      // 记入错题本
      if (Store.recordWrong) Store.recordWrong(answer);
      AudioManager.speak("try again! listen carefully");
      // 禁用所有选项卡片，防止重复点击
      this.disableAllCards();

      // 0.8秒后：高亮正确答案（给正确答案卡片加right类），重播发音作为提示
      this.timer = setTimeout(() => {
        const cards = document.querySelectorAll(".img-card");
        cards.forEach(c => {
          // 通过emoji匹配找到正确答案的卡片，高亮显示
          if (c.querySelector(".emoji").textContent === answer.emoji) {
            c.classList.add("right");
          }
        });
        AudioManager.speak(answer.en);
      }, 800);

      // 2秒后进入下一题（给孩子看正确答案的时间）
      this.timer = setTimeout(() => this.next(), 2000);
    }
  },

  /* ----------------------------------------------------------
   * disableAllCards()
   * 禁用当前所有图片选项卡片，防止用户在跳转前重复点击。
   * 给每个卡片加 disabled 属性，并降低透明度。
   * ---------------------------------------------------------- */
  disableAllCards() {
    const cards = document.querySelectorAll(".img-card");
    cards.forEach(c => {
      c.disabled = true;
      c.style.opacity = "0.85";
    });
  },

  /* ----------------------------------------------------------
   * next()
   * 进入下一题，或全部做完后触发结束回调。
   * 进入下一题前清除定时器。
   * ---------------------------------------------------------- */
  next() {
    // 清除定时器
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }

    this.index++;
    if (this.index >= this.questions.length) {
      // 全部做完，触发结算回调
      if (this.onFinish) this.onFinish(this.correct, this.questions.length);
    } else {
      // 还有下一题，渲染
      this.renderQuestion();
    }
  }
};
