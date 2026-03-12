const api = require('../../utils/api')
const { clearToken } = require('../../utils/auth')

// 对话风格选项
const STYLE_OPTIONS = [
  { value: 'gentle', label: '温柔贴心' },
  { value: 'humorous', label: '幽默有趣' },
  { value: 'professional', label: '专业严谨' },
  { value: 'energetic', label: '元气满满' },
]

// 角色人设选项
const CHARACTER_OPTIONS = [
  { value: 'none', label: '无' },
  { value: 'cat', label: '🐱 小猫咪' },
  { value: 'rabbit', label: '🐰 小兔叽' },
  { value: 'dog', label: '🐶 小狗勾' },
  { value: 'bear', label: '🐻 小熊仔' },
  { value: 'fox', label: '🦊 小狐狸' },
  { value: 'penguin', label: '🐧 小企鹅' },
  { value: 'custom', label: '✏️ 自定义' },
]

Page({
  data: {
    nickname: '',
    avatarUrl: '',
    // 偏好
    chatStyle: 'gentle',
    character: 'none',
    customCharacter: '',
    prefNickname: '',    // AI 对用户的称呼
    // 选项
    styleOptions: STYLE_OPTIONS,
    characterOptions: CHARACTER_OPTIONS,
    styleIndex: 0,
    characterIndex: 0,
    // 状态
    showCustomInput: false,
    loading: true,
  },

  onShow() {
    const token = wx.getStorageSync('token')
    if (!token) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }
    this.loadProfile()
  },

  async loadProfile() {
    const token = wx.getStorageSync('token')
    if (!token) return
    this.setData({ loading: true })
    try {
      const data = await api.get('/api/user/profile')
      const prefs = data.preferences || {}
      const styleIdx = STYLE_OPTIONS.findIndex(o => o.value === (prefs.chat_style || 'gentle'))
      const charIdx = CHARACTER_OPTIONS.findIndex(o => o.value === (prefs.character || 'none'))

      this.setData({
        nickname: data.nickname || '',
        avatarUrl: data.avatar_url || '',
        chatStyle: prefs.chat_style || 'gentle',
        character: prefs.character || 'none',
        customCharacter: prefs.custom_character || '',
        prefNickname: prefs.nickname || '',
        styleIndex: styleIdx >= 0 ? styleIdx : 0,
        characterIndex: charIdx >= 0 ? charIdx : 0,
        showCustomInput: prefs.character === 'custom',
        loading: false,
      })
    } catch (err) {
      console.error('加载用户信息失败', err)
      this.setData({ loading: false })
    }
  },

  // 修改昵称
  handleEditNickname() {
    wx.showModal({
      title: '修改昵称',
      editable: true,
      placeholderText: '请输入新昵称',
      success: async (res) => {
        if (!res.confirm || !res.content) return
        const name = res.content.trim()
        if (!name) return
        try {
          await api.put('/api/user/profile', { nickname: name })
          this.setData({ nickname: name })
          wx.showToast({ title: '昵称已更新', icon: 'success' })
        } catch (err) {
          wx.showToast({ title: '修改失败', icon: 'none' })
        }
      },
    })
  },

  // 对话风格选择
  onStyleChange(e) {
    const idx = Number(e.detail.value)
    const style = STYLE_OPTIONS[idx].value
    this.setData({ styleIndex: idx, chatStyle: style })
    this.savePreferences()
  },

  // 角色人设选择
  onCharacterChange(e) {
    const idx = Number(e.detail.value)
    const char = CHARACTER_OPTIONS[idx].value
    this.setData({
      characterIndex: idx,
      character: char,
      showCustomInput: char === 'custom',
    })
    this.savePreferences()
  },

  // 自定义角色描述
  onCustomCharInput(e) {
    this.setData({ customCharacter: e.detail.value })
  },

  onCustomCharBlur() {
    this.savePreferences()
  },

  // 称呼方式输入
  onPrefNicknameInput(e) {
    this.setData({ prefNickname: e.detail.value })
  },

  onPrefNicknameBlur() {
    this.savePreferences()
  },

  // 保存偏好到后端
  async savePreferences() {
    const token = wx.getStorageSync('token')
    if (!token) return
    const prefs = {
      chat_style: this.data.chatStyle,
      character: this.data.character,
      custom_character: this.data.customCharacter,
      nickname: this.data.prefNickname,
    }
    try {
      await api.put('/api/user/profile', { preferences: prefs })
    } catch (err) {
      console.error('保存偏好失败', err)
    }
  },

  // 关于我们
  handleAbout() {
    wx.showModal({
      title: '关于植物精灵',
      content: 'Plant Sprite v1.0.0\n一款 AI 驱动的家庭生活助手\n🌱 让生活更美好',
      showCancel: false,
    })
  },

  // 退出登录
  handleLogout() {
    wx.showModal({
      title: '提示',
      content: '确定退出登录吗？',
      success: (res) => {
        if (!res.confirm) return
        clearToken()
        wx.redirectTo({ url: '/pages/login/login' })
      },
    })
  },
})
