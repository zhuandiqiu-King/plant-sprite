const api = require('../../utils/api')

Page({
  data: {
    mode: 'add', // add 或 edit
    plantId: null,
    name: '',
    wateringInterval: 7,
    category: 'indoor',
    note: '',
    categories: ['indoor', 'outdoor'],
    categoryNames: ['室内', '室外'],
    categoryIndex: 0,
    identifying: false,
    submitting: false,
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ mode: 'edit', plantId: parseInt(options.id) })
      this.loadPlant(options.id)
    }
  },

  async loadPlant(id) {
    try {
      const plant = await api.get(`/api/plants/${id}`)
      this.setData({
        name: plant.name,
        wateringInterval: plant.watering_interval,
        category: plant.category,
        note: plant.note || '',
        categoryIndex: plant.category === 'outdoor' ? 1 : 0,
      })
    } catch (err) {
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  // 拍照识别
  handleIdentify() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera', 'album'],
      sizeType: ['compressed'],
      success: (res) => {
        const tempPath = res.tempFiles[0].tempFilePath
        this.setData({ identifying: true })
        wx.showLoading({ title: '识别中...' })

        // 压缩图片后再转 base64
        wx.compressImage({
          src: tempPath,
          quality: 50,
          success: (compRes) => {
            this.readAndIdentify(compRes.tempFilePath)
          },
          fail: () => {
            // 压缩失败，直接用原图
            this.readAndIdentify(tempPath)
          },
        })
      },
      fail: (err) => {
        console.error('chooseMedia fail', err)
      },
    })
  },

  readAndIdentify(filePath) {
    const fs = wx.getFileSystemManager()
    fs.readFile({
      filePath,
      encoding: 'base64',
      success: (fileRes) => {
        this.identifyImage(fileRes.data)
      },
      fail: (err) => {
        console.error('readFile fail', err)
        wx.hideLoading()
        this.setData({ identifying: false })
        wx.showToast({ title: '读取图片失败', icon: 'none' })
      },
    })
  },

  async identifyImage(base64) {
    try {
      console.log('识别图片大小:', Math.round(base64.length / 1024), 'KB')
      const result = await api.post('/api/plants/identify', { image: base64 })
      this.setData({
        name: result.name,
        wateringInterval: result.watering_interval,
        category: result.category,
        note: result.description + '\n' + result.care_tips,
        categoryIndex: result.category === 'outdoor' ? 1 : 0,
      })
      wx.showToast({ title: '识别成功', icon: 'success' })
    } catch (err) {
      console.error('识别失败', err)
      wx.showToast({ title: '识别失败，请重试', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ identifying: false })
    }
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value })
  },

  onIntervalInput(e) {
    this.setData({ wateringInterval: parseInt(e.detail.value) || 1 })
  },

  onCategoryChange(e) {
    const idx = e.detail.value
    this.setData({
      categoryIndex: idx,
      category: this.data.categories[idx],
    })
  },

  onNoteInput(e) {
    this.setData({ note: e.detail.value })
  },

  async handleSubmit() {
    const { name, wateringInterval, category, note, mode, plantId } = this.data
    if (!name.trim()) {
      wx.showToast({ title: '请输入植物名称', icon: 'none' })
      return
    }
    this.setData({ submitting: true })

    const payload = {
      name: name.trim(),
      watering_interval: wateringInterval,
      category,
      note: note || null,
    }

    try {
      if (mode === 'edit') {
        await api.put(`/api/plants/${plantId}`, payload)
        wx.showToast({ title: '保存成功', icon: 'success' })
      } else {
        await api.post('/api/plants', payload)
        wx.showToast({ title: '添加成功', icon: 'success' })
      }
      setTimeout(() => wx.navigateBack(), 500)
    } catch (err) {
      wx.showToast({ title: '保存失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },
})
