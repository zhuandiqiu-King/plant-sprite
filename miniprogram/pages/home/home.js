const api = require('../../utils/api')

const recorderManager = wx.getRecorderManager()

Page({
  data: {
    messages: [],     // { role: 'user'|'ai', content: string }
    inputValue: '',
    loading: false,   // AI 回复中
    scrollId: '',     // 滚动锚点
    voiceMode: false, // 语音模式
    recording: false, // 录音中
  },

  onLoad() {
    // 录音结束回调
    recorderManager.onStop((res) => {
      this.setData({ recording: false })
      if (res.duration < 1000) {
        wx.showToast({ title: '说话时间太短', icon: 'none' })
        return
      }
      this.handleVoiceFile(res.tempFilePath)
    })

    recorderManager.onError((err) => {
      console.error('录音失败', err)
      this.setData({ recording: false })
      wx.showToast({ title: '录音失败，请重试', icon: 'none' })
    })
  },

  onShow() {
    const token = wx.getStorageSync('token')
    if (!token) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }
    // 首次进入显示欢迎语
    if (!this.data.messages.length) {
      this.setData({
        messages: [{
          role: 'ai',
          content: '你好！我是夯夯 🏠\n有什么家庭生活问题可以问我哦～\n比如植物养护、家居清洁、烹饪技巧等 😊',
        }],
      })
    }
  },

  onInput(e) {
    this.setData({ inputValue: e.detail.value })
  },

  // 切换语音/文字模式
  toggleVoice() {
    this.setData({ voiceMode: !this.data.voiceMode })
  },

  // 长按开始录音
  startRecord() {
    if (this.data.loading) return
    this.setData({ recording: true })
    recorderManager.start({
      duration: 60000,  // 最长 60 秒
      sampleRate: 16000,
      numberOfChannels: 1,
      encodeBitRate: 48000,
      format: 'mp3',
    })
  },

  // 松手停止录音
  stopRecord() {
    if (this.data.recording) {
      recorderManager.stop()
    }
  },

  // 处理录音文件：上传 → 语音识别 → AI 回复
  async handleVoiceFile(filePath) {
    this.setData({ loading: true })

    try {
      // 上传到云存储
      const cloudPath = `voice/${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`
      const uploadRes = await new Promise((resolve, reject) => {
        wx.cloud.uploadFile({
          cloudPath,
          filePath,
          success: resolve,
          fail: reject,
        })
      })

      // 获取可访问 URL
      const urlRes = await new Promise((resolve, reject) => {
        wx.cloud.getTempFileURL({
          fileList: [uploadRes.fileID],
          success: resolve,
          fail: reject,
        })
      })
      const audioUrl = urlRes.fileList[0].tempFileURL

      // 调用后端语音识别 + AI 回复（超时 60 秒）
      const data = await api.request({
        url: '/api/chat/voice',
        method: 'POST',
        data: { audio_url: audioUrl },
        timeout: 60000,
      })

      // 添加用户消息（识别出的文字）
      const userMsg = { role: 'user', content: data.text || '🎤 语音消息' }
      const aiMsg = { role: 'ai', content: data.reply }
      const updated = [...this.data.messages, userMsg, aiMsg]
      this.setData({
        messages: updated,
        loading: false,
        scrollId: `msg-${updated.length - 1}`,
      })
    } catch (err) {
      console.error('语音处理失败', err)
      const updated = [...this.data.messages, {
        role: 'ai',
        content: '语音识别失败，请重试或改用文字输入 😢',
      }]
      this.setData({
        messages: updated,
        loading: false,
        scrollId: `msg-${updated.length - 1}`,
      })
    }
  },

  // 发送文字消息
  async handleSend() {
    const msg = this.data.inputValue.trim()
    if (!msg || this.data.loading) return

    const messages = [...this.data.messages, { role: 'user', content: msg }]
    this.setData({
      messages,
      inputValue: '',
      loading: true,
      scrollId: `msg-${messages.length - 1}`,
    })

    try {
      const data = await api.request({
        url: '/api/chat',
        method: 'POST',
        data: { message: msg },
        timeout: 30000,
      })
      const updated = [...this.data.messages, { role: 'ai', content: data.reply }]
      this.setData({
        messages: updated,
        loading: false,
        scrollId: `msg-${updated.length - 1}`,
      })
    } catch (err) {
      console.error('AI 回复失败', err)
      const updated = [...this.data.messages, {
        role: 'ai',
        content: '抱歉，我暂时无法回复，请稍后再试 😢',
      }]
      this.setData({
        messages: updated,
        loading: false,
        scrollId: `msg-${updated.length - 1}`,
      })
    }
  },

  // 长按复制
  handleCopy(e) {
    const idx = e.currentTarget.dataset.idx
    const msg = this.data.messages[idx]
    wx.setClipboardData({
      data: msg.content,
      success() {
        wx.showToast({ title: '已复制', icon: 'success' })
      },
    })
  },
})
