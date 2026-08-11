<!--
  The single place the Free / Plus / Pro story is told in the dashboard.
  One hairline grid, one accent tint on the column the customer is already on —
  no per-tier hero cards and no second prose list repeating the same facts.
  Keep the rows in step with CommercializationConfig on the native side.
-->
<template>
  <div class="plan-comparison" data-testid="plan-comparison">
    <div class="grid" role="table" :aria-label="lang.currentPlan">
      <div class="row head" role="row">
        <span class="cell label" role="columnheader"></span>
        <span v-for="column in columns" :key="column.id"
              class="cell value head-cell"
              :class="{ current: column.current }"
              role="columnheader">
          <span class="tier-name">{{ column.title }}</span>
          <small v-if="column.current" class="tier-current">{{ lang.planTableYourPlan }}</small>
        </span>
      </div>

      <div v-for="row in rows" :key="row.id" class="row" role="row">
        <span class="cell label" role="rowheader">{{ row.title }}</span>
        <span v-for="(value, index) in row.values" :key="`${row.id}-${columns[index].id}`"
              class="cell value"
              :class="{ current: columns[index].current }"
              role="cell"
              :aria-label="cellLabel(row, index)">
          <v-icon v-if="value === true" name="check" class="mark-yes"></v-icon>
          <span v-else-if="value === false" class="mark-no" aria-hidden="true">—</span>
          <span v-else class="mark-text">{{ value }}</span>
        </span>
      </div>
    </div>
  </div>
</template>

<script>
import { mapState } from 'vuex'

export default {
  name: 'PlanComparison',
  computed: {
    ...mapState(['lang', 'entitlementTier', 'freeSessionLimit']),
    columns() {
      return [
        { id: 'free', title: this.lang.planFree || 'Free', current: this.entitlementTier === 'free' },
        { id: 'plus', title: this.lang.planPlusShort || 'Plus', current: this.entitlementTier === 'plus' },
        { id: 'pro', title: this.lang.planPremium || 'Pro', current: this.entitlementTier === 'pro' }
      ]
    },
    rows() {
      const unlimited = this.lang.planTableUnlimited || 'Unlimited'
      const weekly = this.lang.planTableWeeklyFive || '5 / week'
      // Safari is a product name, spelled the same in every locale we ship.
      const safariOnly = 'Safari'
      const everyBrowser = this.lang.planTableEveryBrowser || 'All browsers'
      return [
        {
          id: 'core',
          title: this.lang.planTableCoreFeatures || 'Core features',
          values: [true, true, true]
        },
        {
          id: 'sessions',
          title: this.lang.planTableSessions || 'Saved sessions',
          values: [String(this.freeSessionLimit), unlimited, unlimited]
        },
        {
          id: 'ai',
          title: this.lang.planTableAI || 'AI organizing',
          values: [weekly, weekly, unlimited]
        },
        // The switcher itself is in every tier — what Pro widens is the set of
        // browsers whose open tabs it can list.
        {
          id: 'switcher',
          title: this.lang.planTableSwitcher || 'Tab switcher',
          values: [safariOnly, safariOnly, everyBrowser]
        },
        {
          id: 'browsers',
          title: this.lang.featureMultiBrowserTitle || 'Multi-browser support',
          values: [false, false, true]
        },
        {
          id: 'future',
          title: this.lang.planTableFuturePro || 'Future Pro features',
          values: [false, false, true]
        }
      ]
    }
  },
  methods: {
    cellLabel(row, index) {
      const value = row.values[index]
      const state = value === true
        ? (this.lang.planTableIncluded || 'Included')
        : value === false
          ? (this.lang.planTableNotIncluded || 'Not included')
          : value
      return `${row.title} · ${this.columns[index].title}: ${state}`
    }
  }
}
</script>

<style scoped>
.plan-comparison {
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 12px;
  overflow: hidden;
}

.grid {
  display: block;
}

.row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) repeat(3, 68px);
  align-items: stretch;
}

.row + .row {
  border-top: 1px solid var(--border-color, #e2e8f0);
}

.head {
  background: rgba(0, 0, 0, 0.03);
}

.cell {
  display: flex;
  align-items: center;
  min-height: 38px;
  font-size: 13px;
}

.label {
  padding: 8px 12px;
  color: var(--text-primary, #2d3748);
  line-height: 1.35;
}

.value {
  justify-content: center;
  text-align: center;
  padding: 6px 4px;
}

.value.current {
  background: rgba(250, 128, 114, 0.13);
}

.head-cell {
  flex-direction: column;
  justify-content: center;
  gap: 1px;
  padding: 8px 4px;
}

.tier-name {
  font-weight: 600;
  font-size: 13px;
}

.head-cell.current .tier-name,
.tier-current {
  color: var(--primary-color, #fa8072);
}

.tier-current {
  font-size: 10px;
  line-height: 1.1;
  white-space: nowrap;
}

.mark-yes {
  width: 15px;
  height: 15px;
  color: var(--primary-color, #fa8072);
}

.mark-no {
  color: var(--text-secondary, #718096);
  opacity: 0.6;
}

.mark-text {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary, #2d3748);
}

@media (max-width: 420px) {
  .row {
    grid-template-columns: minmax(0, 1fr) repeat(3, 54px);
  }

  .cell {
    font-size: 12px;
  }
}

@media (prefers-color-scheme: dark) {
  .head {
    background: rgba(255, 255, 255, 0.05);
  }
}
</style>
