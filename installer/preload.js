const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('installer', {
  close:          ()    => ipcRenderer.send('win:close'),
  minimize:       ()    => ipcRenderer.send('win:minimize'),
  browse:         ()    => ipcRenderer.invoke('installer:browse'),
  diskInfo:       (p)   => ipcRenderer.invoke('installer:disk-info', p),
  install:        (opt) => ipcRenderer.invoke('installer:install', opt),
  launch:         (dir) => ipcRenderer.send('installer:launch', dir),
  getDefaultDir:  ()    => ipcRenderer.invoke('installer:get-default-dir'),
  onProgress: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('installer:progress', handler);
    return () => ipcRenderer.removeListener('installer:progress', handler);
  },
});
