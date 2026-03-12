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
    photoUrl: '',      // 云存储 fileID 或 base64 data URI
    photoLocalPath: '', // 本地预览临时路径
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
        photoUrl: plant.photo_url || '',
      })
    } catch (err) {
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  // ---- 植物照片 ----

  handleChoosePhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera', 'album'],
      sizeType: ['compressed'],
      success: (res) => {
        const tempPath = res.tempFiles[0].tempFilePath
        this.setData({ photoLocalPath: tempPath })
        this.uploadToCloud(tempPath)
      },
    })
  },

  handleRemovePhoto() {
    const oldUrl = this.data.photoUrl
    this.setData({ photoUrl: '', photoLocalPath: '' })
    // 如果是云存储 fileID，尝试清理
    if (oldUrl && oldUrl.startsWith('cloud://')) {
      wx.cloud.deleteFile({ fileList: [oldUrl] })
    }
  },

  handlePreviewPhoto() {
    const src = this.data.photoLocalPath || this.data.photoUrl
    if (src) {
      wx.previewImage({ urls: [src], current: src })
    }
  },

  // 优先上传到云存储，失败则回退到 base64
  uploadToCloud(filePath) {
    wx.showLoading({ title: '上传中...' })
    const cloudPath = `plant-photos/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`

    wx.cloud.uploadFile({
      cloudPath,
      filePath,
      config: { env: 'prod-0g02is9d648082af' },
      success: (res) => {
        this.setData({ photoUrl: res.fileID })
        wx.hideLoading()
        wx.showToast({ title: '照片已上传', icon: 'success' })
      },
      fail: (err) => {
        console.warn('云存储上传失败，回退到 base64', err)
        // 回退：压缩后转 base64 存数据库
        this.compressAndEncode(filePath)
      },
    })
  },

  // 回退方案：压缩图片并转为 base64 data URI
  compressAndEncode(filePath) {
    const that = this
    wx.getImageInfo({
      src: filePath,
      success(info) {
        const maxSize = 400
        let w = info.width
        let h = info.height
        if (w > h && w > maxSize) {
          h = Math.round(h * maxSize / w)
          w = maxSize
        } else if (h > maxSize) {
          w = Math.round(w * maxSize / h)
          h = maxSize
        }

        const canvas = wx.createOffscreenCanvas({ type: '2d', width: w, height: h })
        const ctx = canvas.getContext('2d')
        const img = canvas.createImage()
        img.onload = () => {
          ctx.drawImage(img, 0, 0, w, h)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.6)
          that.setData({ photoUrl: dataUrl })
          wx.hideLoading()
        }
        img.onerror = () => {
          that.fallbackCompressPhoto(filePath)
        }
        img.src = filePath
      },
      fail() {
        that.fallbackCompressPhoto(filePath)
      },
    })
  },

  fallbackCompressPhoto(filePath) {
    wx.compressImage({
      src: filePath,
      quality: 30,
      success: (compRes) => {
        this.readFileAsDataUrl(compRes.tempFilePath)
      },
      fail: () => {
        this.readFileAsDataUrl(filePath)
      },
    })
  },

  readFileAsDataUrl(filePath) {
    const fs = wx.getFileSystemManager()
    fs.readFile({
      filePath,
      encoding: 'base64',
      success: (res) => {
        this.setData({ photoUrl: `data:image/jpeg;base64,${res.data}` })
        wx.hideLoading()
      },
      fail: () => {
        wx.hideLoading()
        this.setData({ photoLocalPath: '' })
        wx.showToast({ title: '处理照片失败', icon: 'none' })
      },
    })
  },

  // ---- 拍照识别 ----

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

        // 先用 canvas 缩小尺寸到 400px，再压缩质量
        this.resizeAndIdentify(tempPath)
      },
      fail: (err) => {
        console.error('chooseMedia fail', err)
      },
    })
  },

  resizeAndIdentify(filePath) {
    const that = this
    wx.getImageInfo({
      src: filePath,
      success(info) {
        // 缩放到最大 400px
        const maxSize = 400
        let w = info.width
        let h = info.height
        if (w > h && w > maxSize) {
          h = Math.round(h * maxSize / w)
          w = maxSize
        } else if (h > maxSize) {
          w = Math.round(w * maxSize / h)
          h = maxSize
        }

        const canvas = wx.createOffscreenCanvas({ type: '2d', width: w, height: h })
        const ctx = canvas.getContext('2d')
        const img = canvas.createImage()
        img.onload = () => {
          ctx.drawImage(img, 0, 0, w, h)
          // 导出为 base64（quality 0.6）
          const dataUrl = canvas.toDataURL('image/jpeg', 0.6)
          const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
          console.log('压缩后图片大小:', Math.round(base64.length / 1024), 'KB')
          that.identifyImage(base64)
        }
        img.onerror = () => {
          // canvas 方式失败，回退到 compressImage
          that.fallbackCompress(filePath)
        }
        img.src = filePath
      },
      fail() {
        that.fallbackCompress(filePath)
      },
    })
  },

  fallbackCompress(filePath) {
    wx.compressImage({
      src: filePath,
      quality: 20,
      success: (compRes) => {
        this.readAndIdentify(compRes.tempFilePath)
      },
      fail: () => {
        this.readAndIdentify(filePath)
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
    const sizeKB = Math.round(base64.length / 1024)
    console.log('图片大小:', sizeKB, 'KB')
    if (sizeKB > 100) {
      wx.hideLoading()
      this.setData({ identifying: false })
      wx.showModal({
        title: '图片太大',
        content: `当前图片 ${sizeKB}KB，超出限制。请选择一张更小的图片，或使用相机拍摄时离近一些。`,
        showCancel: false,
      })
      return
    }
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
    const { name, wateringInterval, category, note, mode, plantId, photoUrl } = this.data
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
      photo_url: photoUrl || null,
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
