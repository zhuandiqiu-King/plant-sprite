const api = require('../../utils/api')

Page({
  data: {
    reminders: [],
    plants: [],
    loading: true,
    watering: false, // 批量浇水中
  },

  onShow() {
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

  // 单个浇水
  async handleWaterOne(e) {
    const id = e.currentTarget.dataset.id
    const name = e.currentTarget.dataset.name
    try {
      await api.post(`/api/plants/${id}/water`)
      wx.showToast({ title: `${name} 已浇水 💧`, icon: 'none' })
      // 从提醒列表移除，刷新植物列表
      const reminders = this.data.reminders.filter(r => r.id !== id)
      this.setData({ reminders })
      // 后台刷新植物列表更新状态
      api.get('/api/plants').then(plants => this.setData({ plants }))
    } catch (err) {
      wx.showToast({ title: '浇水失败，请重试', icon: 'none' })
    }
  },

  // 批量全部浇水
  async handleWaterAll() {
    const { reminders } = this.data
    if (!reminders.length) return
    wx.showModal({
      title: '确认浇水',
      content: `确定为 ${reminders.length} 棵植物全部浇水吗？`,
      success: async (res) => {
        if (!res.confirm) return
        this.setData({ watering: true })
        try {
          await Promise.all(reminders.map(r => api.post(`/api/plants/${r.id}/water`)))
          wx.showToast({ title: '全部浇水完成 🎉', icon: 'none' })
          this.setData({ reminders: [], watering: false })
          // 刷新植物列表
          api.get('/api/plants').then(plants => this.setData({ plants }))
        } catch (err) {
          this.setData({ watering: false })
          wx.showToast({ title: '部分浇水失败，请重试', icon: 'none' })
          this.loadData()
        }
      },
    })
  },

  goDetail(e) {
    const id = e.detail.id
    wx.navigateTo({ url: `/pages/plant/detail/detail?id=${id}` })
  },

  goAdd() {
    wx.navigateTo({ url: '/pages/plant/add/add' })
  },
})
