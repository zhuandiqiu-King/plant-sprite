const { login } = require('../../utils/auth')

Page({
  data: {
    loading: false,
  },

  onLoad() {
    // 已登录直接跳首页
    const token = wx.getStorageSync('token')
    if (token) {
      wx.redirectTo({ url: '/pages/index/index' })
    }
  },

  handleLogin() {
    if (this.data.loading) return
    this.setData({ loading: true })
    console.log('开始登录...')

    login('', '')
      .then((data) => {
        console.log('登录成功', data)
        wx.redirectTo({ url: '/pages/index/index' })
      })
      .catch((err) => {
        console.error('登录失败详情:', err.message || err)
        wx.showToast({ title: '登录失败，请重试', icon: 'none' })
      })
      .finally(() => {
        this.setData({ loading: false })
      })
  },
})
