const api = require('../../utils/api')

Page({
  data: {
    plantId: null,
    plant: null,
    records: [],
    loading: true,
  },

  onLoad(options) {
    this.setData({ plantId: parseInt(options.id) })
  },

  onShow() {
    this.loadData()
  },

  async loadData() {
    const { plantId } = this.data
    this.setData({ loading: true })
    try {
      const [plant, records] = await Promise.all([
        api.get(`/api/plants/${plantId}`),
        api.get(`/api/plants/${plantId}/records`),
      ])
      this.setData({ plant, records, loading: false })
    } catch (err) {
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  async handleWater() {
    try {
      await api.post(`/api/plants/${this.data.plantId}/water`)
      wx.showToast({ title: '浇水成功', icon: 'success' })
      this.loadData()
    } catch (err) {
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  handleEdit() {
    wx.navigateTo({ url: `/pages/add/add?id=${this.data.plantId}` })
  },

  handlePreviewPhoto() {
    const url = this.data.plant.photo_url
    if (url) {
      wx.previewImage({ urls: [url], current: url })
    }
  },

  handleDelete() {
    wx.showModal({
      title: '确认删除',
      content: `确定删除「${this.data.plant.name}」吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            await api.del(`/api/plants/${this.data.plantId}`)
            wx.showToast({ title: '已删除', icon: 'success' })
            setTimeout(() => wx.navigateBack(), 500)
          } catch (err) {
            wx.showToast({ title: '删除失败', icon: 'none' })
          }
        }
      },
    })
  },

  formatTime(ts) {
    return ts ? ts.replace('T', ' ').slice(0, 16) : ''
  },
})
