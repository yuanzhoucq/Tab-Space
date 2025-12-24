<template>
  <div>
    <div class="backup-dropdown">
      <span class="link" @click="forceBackup">{{lang.backupNow || 'Backup Now'}}</span>
      <br />
      <span class="link" @click="openBackupList">
        {{lang.viewBackups || 'View Backups'}} ({{backups.length}})
      </span>
    </div>
    
    <!-- Backup list modal -->
    <div v-if="showBackupList" class="backup-modal" @click.self="showBackupList = false">
      <div class="backup-modal-content">
        <div class="backup-modal-header">
          <h3>{{lang.backupHistory || 'Backup History'}}</h3>
          <span class="close-btn" @click="showBackupList = false">&times;</span>
        </div>
        <div class="backup-list">
          <div v-if="backups.length === 0" class="no-backups">
            {{lang.noBackups || 'No backups available'}}
          </div>
          <div v-for="backup in backups" :key="backup.filename" class="backup-item">
            <div class="backup-info">
              <span class="backup-date">{{formatDate(backup.createdAt)}}</span>
              <span class="backup-meta">
                {{backup.sessionCount}} {{lang.sessions || 'sessions'}} · {{formatSize(backup.fileSize)}}
              </span>
            </div>
            <div class="backup-actions">
              <button class="restore-btn" @click="restoreBackup(backup.filename)">
                {{lang.restore || 'Restore'}}
              </button>
            </div>
          </div>
        </div>
        <div class="backup-info-footer">
          <p>{{lang.backupInfoAuto || 'Backups are created automatically when you save sessions (max every 5 min).'}}</p>
          <p>{{lang.backupInfoRetention || 'Retention: 7 hourly, 7 daily, 4 weekly, 12 monthly backups.'}}</p>
          <p class="backup-path">{{lang.backupInfoPath || 'Location:'}} ~/Library/Group Containers/.../Backups/</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { mapState } from "vuex"

export default {
  name: "BackupDropdown",
  data() {
    return {
      showBackupList: false,
      backups: [],
      loading: false
    }
  },
  computed: mapState(["lang", "bridge"]),
  mounted() {
    // Listen for backup responses
    window.addEventListener("message", this.handleMessage)
    // Request backup list when component mounts
    this.loadBackups()
  },
  beforeDestroy() {
    window.removeEventListener("message", this.handleMessage)
  },
  methods: {
    handleMessage(evt) {
      if (!evt.origin.includes("joyuer.cn") && !evt.origin.includes("mytab.space") && evt.origin !== "yuanzhoucq.github.io") return
      
      switch (evt.data.cmd) {
        case "ReturnBackups":
          try {
            this.backups = JSON.parse(evt.data.backups)
          } catch (e) {
            console.log("Failed to parse backups:", e)
          }
          this.loading = false
          break
        case "BackupComplete":
          this.loadBackups()
          this.showNotification(this.lang.backupComplete || 'Backup created successfully')
          break
      }
    },
    loadBackups() {
      if (this.bridge) {
        this.loading = true
        this.bridge.send({ cmd: "ListBackups" })
      } else {
        setTimeout(() => this.loadBackups(), 500)
      }
    },
    openBackupList() {
      // Always refresh the list when opening the modal
      this.loadBackups()
      this.showBackupList = true
    },
    forceBackup() {
      if (this.bridge) {
        this.bridge.send({ cmd: "ForceBackup" })
        this.showNotification(this.lang.backupStarted || 'Creating backup...')
      }
    },
    restoreBackup(filename) {
      if (confirm(this.lang.restoreConfirm || 'Are you sure you want to restore this backup? This will add all sessions from the backup.')) {
        if (this.bridge) {
          this.bridge.send({ cmd: "RestoreBackup", filename: filename })
          this.showBackupList = false
          this.showNotification(this.lang.restoreComplete || 'Backup restored successfully')
        }
      }
    },
    formatDate(dateValue) {
      // Swift JSONEncoder sends Date as epoch seconds, JS needs milliseconds
      let date;
      if (typeof dateValue === 'number') {
        // Epoch timestamp in seconds - convert to milliseconds
        date = new Date(dateValue * 1000);
      } else if (typeof dateValue === 'string') {
        date = new Date(dateValue);
      } else {
        date = new Date();
      }
      return date.toLocaleString();
    },
    formatSize(bytes) {
      if (bytes < 1024) return bytes + ' B'
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
    },
    showNotification(message) {
      // Simple notification - could be enhanced with a toast component
      console.log(message)
    }
  }
}
</script>

<style scoped>
.backup-dropdown {
  display: none;
  position: absolute;
  margin-left: -40px;
  padding: 3px;
  font-size: 12px;
  border: 1px solid gray;
  border-radius: 5px;
  text-align: left;
  background-color: #fbfbfb;
  z-index: 100;
}

.link {
  cursor: pointer;
}

.backup-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.backup-modal-content {
  background: white;
  border-radius: 8px;
  width: 90%;
  max-width: 500px;
  max-height: 70vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.backup-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 20px;
  border-bottom: 1px solid #eee;
}

.backup-modal-header h3 {
  margin: 0;
}

.close-btn {
  font-size: 24px;
  cursor: pointer;
  color: #666;
}

.close-btn:hover {
  color: #000;
}

.backup-list {
  overflow-y: auto;
  padding: 10px 20px;
}

.no-backups {
  padding: 20px;
  text-align: center;
  color: #999;
}

.backup-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid #eee;
}

.backup-item:last-child {
  border-bottom: none;
}

.backup-info {
  display: flex;
  flex-direction: column;
}

.backup-date {
  font-weight: 500;
}

.backup-meta {
  font-size: 12px;
  color: #666;
  margin-top: 4px;
}

.restore-btn {
  background: #007AFF;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.restore-btn:hover {
  background: #0056b3;
}

.backup-info-footer {
  padding: 15px 20px;
  background: #f5f5f5;
  border-top: 1px solid #eee;
  font-size: 12px;
  color: #666;
}

.backup-info-footer p {
  margin: 4px 0;
}

.backup-path {
  font-family: monospace;
  font-size: 11px;
  color: #888;
  word-break: break-all;
}

@media (prefers-color-scheme: dark) {
  .backup-dropdown {
    background-color: #353535;
  }
  
  .backup-modal-content {
    background: #2a2a2a;
    color: #fff;
  }
  
  .backup-modal-header {
    border-bottom-color: #444;
  }
  
  .close-btn {
    color: #aaa;
  }
  
  .close-btn:hover {
    color: #fff;
  }
  
  .backup-item {
    border-bottom-color: #444;
  }
  
  .backup-meta {
    color: #999;
  }
  
  .backup-info-footer {
    background: #1a1a1a;
    border-top-color: #444;
    color: #999;
  }
  
  .backup-path {
    color: #777;
  }
}
</style>
