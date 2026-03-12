Page({
  data: {
    tools: [
      {
        id: 'plants',
        name: '植物管理',
        icon: '🌿',
        desc: '浇水提醒与植物养护',
        active: true,
        url: '/pages/plant/index/index',
      },
      {
        id: 'coming1',
        name: '家居清洁',
        icon: '🧹',
        desc: '敬请期待',
        active: false,
      },
      {
        id: 'coming2',
        name: '烹饪助手',
        icon: '🍳',
        desc: '敬请期待',
        active: false,
      },
      {
        id: 'coming3',
        name: '宠物护理',
        icon: '🐾',
        desc: '敬请期待',
        active: false,
      },
    ],
  },

  onShow() {
    const token = wx.getStorageSync('token')
    if (!token) {
      wx.redirectTo({ url: '/pages/login/login' })
    }
  },

  handleTap(e) {
    const id = e.currentTarget.dataset.id
    const tool = this.data.tools.find(t => t.id === id)
    if (!tool) return
    if (tool.active) {
      wx.navigateTo({ url: tool.url })
    } else {
      wx.showToast({ title: '功能开发中，敬请期待 🔜', icon: 'none' })
    }
  },
})
