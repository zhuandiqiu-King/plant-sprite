const api = require('../../utils/api')

Page({
  data: {
    reminders: [],
    plants: [],
    loading: true,
  },

  onShow() {
    // 未登录跳登录页
    const token = wx.getStorageSync('token')
    if (!token) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }
    this.loadData()
  },

  onPullDownRefresh() {
    this.loadData().then(() => wx.stopPullDownRefresh())
  },

  async loadData() {
    this.setData({ loading: true })
    try {
      const [reminders, plants] = await Promise.all([
        api.get('/api/reminders'),
        api.get('/api/plants'),
      ])
      this.setData({ reminders, plants, loading: false })
    } catch (err) {
      console.error('加载数据失败', err)
      this.setData({ loading: false })
    }
  },

  goDetail(e) {
    const id = e.detail.id
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` })
  },

  goAdd() {
    wx.navigateTo({ url: '/pages/add/add' })
  },
})
