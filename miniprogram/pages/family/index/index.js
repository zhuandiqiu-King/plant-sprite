const api = require('../../../utils/api')

Page({
  data: {
    families: [],
    currentFamilyId: null,
    loading: true,
  },

  onShow() {
    this.loadFamilies()
  },

  async loadFamilies() {
    try {
      const families = await api.get('/api/family')
      const app = getApp()
      const currentFamilyId = app.globalData.currentFamilyId || null
      this.setData({ families, currentFamilyId, loading: false })
    } catch (err) {
      console.error('加载家庭列表失败', err)
      this.setData({ loading: false })
    }
  },

  // 切换家庭
  async handleSwitch(e) {
    const familyId = e.currentTarget.dataset.id
    if (familyId === this.data.currentFamilyId) return
    try {
      await api.put('/api/family/switch', { family_id: familyId })
      const app = getApp()
      const fam = this.data.families.find((f) => f.id === familyId)
      app.globalData.currentFamilyId = familyId
      app.globalData.currentFamilyName = fam ? fam.name : ''
      this.setData({ currentFamilyId: familyId })
      wx.showToast({ title: '已切换', icon: 'success' })
    } catch (err) {
      wx.showToast({ title: '切换失败', icon: 'none' })
    }
  },

  // 进入家庭详情
  goDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/family/detail/detail?id=${id}` })
  },

  // 搭一个夯夯家
  handleCreate() {
    wx.showModal({
      title: '搭一个夯夯家',
      editable: true,
      placeholderText: '给家庭起个名字吧',
      success: async (res) => {
        if (!res.confirm || !res.content || !res.content.trim()) return
        try {
          const fam = await api.post('/api/family', { name: res.content.trim() })
          // 自动切换到新家庭
          const app = getApp()
          app.globalData.currentFamilyId = fam.id
          app.globalData.currentFamilyName = fam.name
          wx.showToast({ title: '创建成功', icon: 'success' })
          this.loadFamilies()
        } catch (err) {
          wx.showToast({ title: '创建失败', icon: 'none' })
        }
      },
    })
  },
})
