<!--
  The dashboard's standing mention of the browser tab switcher.

  It sits under the search field on purpose: someone about to search what they
  saved is exactly the person who wants to know one shortcut also searches what
  is still open. The shortcut can be tried without leaving the page, which no
  banner can offer — the hot key is global, so pressing it here raises the
  panel immediately.

  The look is the old sidebar tips note (the .tips block removed with the
  static tips feed): a soft coral note with a salmon left bar and italic text.

  The dashboard cannot open the switcher or its settings: there is no bridge
  message for either. This tells; the native app does.
-->
<template>
  <div v-if="switcherHintAvailable" class="switcher-hint" data-testid="switcher-hint">
    <button type="button"
            class="switcher-chip"
            data-testid="switcher-hint-chip"
            :aria-expanded="open ? 'true' : 'false'"
            @click="toggle">
      <kbd class="switcher-key">{{ shortcut }}</kbd>
      <span class="switcher-chip-text">{{ lang.switcherHintChip }}</span>
    </button>

    <div v-if="open"
         class="switcher-popover"
         role="dialog"
         :aria-label="lang.switcherTitle"
         data-testid="switcher-hint-popover">
      <p class="switcher-popover-title">{{ lang.switcherTitle }}</p>
      <p class="switcher-popover-body">{{ intro }}</p>
      <p class="switcher-popover-body">{{ lang.switcherPlans }}</p>
      <p class="switcher-popover-note">{{ lang.switcherSettingsNote }}</p>
    </div>
  </div>
</template>

<script>
import { mapGetters, mapState } from 'vuex'
import Constants from '../constants'

export default {
  name: 'SwitcherHint',
  data() {
    return {
      open: false
    }
  },
  computed: {
    ...mapState(['lang']),
    ...mapGetters(['switcherHintAvailable']),
    shortcut() {
      return Constants.switcherShortcut
    },
    intro() {
      const template = this.lang.switcherIntro || 'Press {shortcut} anywhere on your Mac.'
      return template.replace('{shortcut}', this.shortcut)
    }
  },
  mounted() {
    document.addEventListener('keydown', this.onKeydown)
    document.addEventListener('click', this.onDocumentClick)
  },
  beforeDestroy() {
    document.removeEventListener('keydown', this.onKeydown)
    document.removeEventListener('click', this.onDocumentClick)
  },
  methods: {
    toggle() {
      this.open = !this.open
    },
    onKeydown(event) {
      if (event.key === 'Escape' && this.open) this.open = false
    },
    onDocumentClick(event) {
      if (!this.open) return
      if (this.$el && this.$el.contains(event.target)) return
      this.open = false
    }
  }
}
</script>

<style scoped>
/* The hint takes the search field's own width, so its left bar lines up with
   the field's left edge. */
.switcher-hint {
  position: relative;
  width: 100%;
}

/* The old sidebar tips note: soft coral wash, small text. The salmon leading
   bar lives on the .search-field wrapper in Admin.vue, running the whole
   height of field + hint so the pair reads as one element. The hint sits
   flush under the field: its top corners are square at the seam, and the
   left edge stays a straight line. Clicking still opens the detail popover. */
.switcher-chip {
  display: flex;
  align-items: baseline;
  gap: 6px;
  width: 100%;
  padding: 4px 10px;
  border: 0;
  border-radius: 0 0 6px 0;
  background-color: rgba(250, 128, 114, 0.08);
  color: var(--text-secondary, #666);
  font-family: inherit;
  font-size: 11px;
  line-height: 1.5;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.switcher-chip:hover {
  background-color: rgba(250, 128, 114, 0.14);
}

/* The shortcut stays upright so it reads as a key, not as part of the italic
   sentence. */
.switcher-key {
  padding: 0;
  background: none;
  border: 0;
  box-shadow: none;
  color: var(--text-primary);
  font-family: inherit;
  font-size: inherit;
  font-style: normal;
  font-weight: 600;
}

.switcher-popover {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 1100;
  width: 300px;
  max-width: calc(100vw - 32px);
  padding: 12px 14px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--card-bg);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.14), 0 2px 8px rgba(0, 0, 0, 0.08);
  text-align: left;
}

/* A small caret so the popover reads as anchored to the hint. */
.switcher-popover::before {
  content: "";
  position: absolute;
  top: -6px;
  right: 24px;
  width: 10px;
  height: 10px;
  background: var(--card-bg);
  border-left: 1px solid var(--border-color);
  border-top: 1px solid var(--border-color);
  transform: rotate(45deg);
}

.switcher-popover-title {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.switcher-popover-body {
  margin: 0 0 6px;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.switcher-popover-note {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--text-secondary);
  opacity: 0.85;
}

@media (prefers-color-scheme: dark) {
  .switcher-popover {
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.55), 0 2px 8px rgba(0, 0, 0, 0.3);
  }
}
</style>
