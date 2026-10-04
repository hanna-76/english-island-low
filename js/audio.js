/* ============================================================
 * audio.js —— 英语发音控制
 *
 * 方案：使用有道翻译 TTS 在线接口播放 mp3 音频
 * 优点：不依赖浏览器语音合成，微信/安卓浏览器/iOS 都能发音
 * 接口：https://dict.youdao.com/dictvoice?audio=单词&type=2
 *       type=1 英式发音，type=2 美式发音
 *
 * 备用方案：如果在线接口加载失败，回退到浏览器 Web Speech API
 * ============================================================ */

const AudioManager = {
  muted: false,          // 是否静音
  rate: 0.85,            // 语速（备用语音合成时使用）
  voice: null,           // 备用发音人
  audio: null,           // HTML5 Audio 对象，用于播放 mp3
  ttsType: 2,            // TTS 发音类型：1=英式，2=美式

  /* ----------------------------------------------------------
   * init()
   * 初始化音频管理器。
   * 1. 从 localStorage 读取静音状态
   * 2. 创建 HTML5 Audio 对象
   * 3. 预加载备用语音合成的发音人列表
   * ---------------------------------------------------------- */
  init() {
    this.muted = localStorage.getItem("ei_muted") === "1";

    // 创建 HTML5 Audio 对象，用于播放在线 TTS 音频
    this.audio = new Audio();
    this.audio.preload = "auto";

    // 预加载备用语音合成的发音人（在线接口失败时使用）
    const pickVoice = () => {
      const voices = window.speechSynthesis
        ? window.speechSynthesis.getVoices()
        : [];
      this.voice =
        voices.find(v => /en[-_]US/i.test(v.lang) && /female|samantha|zira|google us english/i.test(v.name)) ||
        voices.find(v => /en[-_]US/i.test(v.lang)) ||
        voices.find(v => /^en/i.test(v.lang)) ||
        null;
    };
    pickVoice();
    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = pickVoice;
    }
  },

  /* ----------------------------------------------------------
   * speak(text, onEnd)
   * 朗读一段英文。
   *
   * 优先使用有道 TTS 在线接口播放 mp3：
   *   1. 如果已静音，直接回调结束
   *   2. 停止当前正在播放的音频
   *   3. 设置音频源为有道 TTS 接口 URL
   *   4. 播放音频
   *   5. 播放结束后调用 onEnd 回调
   *   6. 如果加载失败（网络问题等），回退到浏览器语音合成
   *
   * 参数：
   *   text  —— 要朗读的英文文本
   *   onEnd —— 朗读结束后的回调（可选）
   * ---------------------------------------------------------- */
  speak(text, onEnd) {
    // 如果已静音，直接结束
    if (this.muted) {
      if (onEnd) onEnd();
      return;
    }

    // 停止之前的播放
    this.stop();

    // 使用有道 TTS 在线接口
    // 对文本进行 URL 编码，处理空格和特殊字符
    const encodedText = encodeURIComponent(text);
    const url = `https://dict.youdao.com/dictvoice?audio=${encodedText}&type=${this.ttsType}`;

    // 清除之前的事件监听
    this.audio.onended = null;
    this.audio.onerror = null;

    // 播放结束回调
    this.audio.onended = () => {
      if (onEnd) onEnd();
    };

    // 加载失败时，回退到浏览器语音合成
    this.audio.onerror = () => {
      this.speakFallback(text, onEnd);
    };

    // 设置音频源并播放
    try {
      this.audio.src = url;
      this.audio.play().catch(() => {
        // 自动播放被浏览器阻止时，回退到语音合成
        this.speakFallback(text, onEnd);
      });
    } catch (e) {
      // 任何异常都回退到语音合成
      this.speakFallback(text, onEnd);
    }
  },

  /* ----------------------------------------------------------
   * speakFallback(text, onEnd)
   * 备用发音方案：使用浏览器自带的 Web Speech API。
   * 当在线 TTS 接口加载失败或自动播放被阻止时调用。
   * ---------------------------------------------------------- */
  speakFallback(text, onEnd) {
    if (!window.speechSynthesis) {
      if (onEnd) onEnd();
      return;
    }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "en-US";
    utter.rate = this.rate;
    if (this.voice) utter.voice = this.voice;
    if (onEnd) {
      utter.onend = onEnd;
      utter.onerror = onEnd;
    }
    window.speechSynthesis.speak(utter);
  },

  /* ----------------------------------------------------------
   * stop()
   * 停止当前正在播放的音频。
   * 同时停止在线音频和语音合成。
   * ---------------------------------------------------------- */
  stop() {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  },

  /* ----------------------------------------------------------
   * toggleMute()
   * 切换静音状态。
   * 静音时立即停止播放，并把状态保存到 localStorage。
   * 返回新的静音状态。
   * ---------------------------------------------------------- */
  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem("ei_muted", this.muted ? "1" : "0");
    if (this.muted) this.stop();
    return this.muted;
  }
};
