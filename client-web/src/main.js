import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import Aura from '@primevue/themes/aura'
import { definePreset } from '@primevue/themes'
import ToastService from 'primevue/toastservice'
import ConfirmationService from 'primevue/confirmationservice'
import Tooltip from 'primevue/tooltip'
import 'primeicons/primeicons.css'
import './assets/styles/global.css'
import './assets/styles/tvel-theme.css'
import App from './App.vue'
import router from './router'

// Brand-toned Aura: replaces PrimeVue's default emerald primary with the
// TVEL/Rosatom blue palette. Affects every PrimeVue component that uses
// --p-primary-* (buttons, Panel headers, Stepper line, focus rings, …).
// Mirrors the swatches defined in assets/styles/tvel-theme.css, which
// otherwise gets overridden by the Aura preset injecting its own CSS vars
// at runtime.
const TvelAura = definePreset(Aura, {
  semantic: {
    primary: {
      50:  '#E6EFF8',
      100: '#C0D5EC',
      200: '#99BBDF',
      300: '#6CACE4',
      400: '#025EA1',
      500: '#003274',
      600: '#002A60',
      700: '#00204A',
      800: '#001633',
      900: '#000D1E',
      950: '#000813',
    },
  },
})

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(PrimeVue, {
  theme: {
    preset: TvelAura,
    options: {
      darkModeSelector: false   // light theme only — never follows OS dark mode
    }
  },
  // Toast brand-tone — overrides PrimeVue Aura defaults so success / error /
  // warn / info match the DS .badge palette (DesignSystemPage.vue Section 6).
  // Border-only treatment keeps the toast visually close to .glass-card.
  pt: {
    toast: {
      root: { class: 'badb-toast' },
    },
  },
  locale: {
    firstDayOfWeek: 1,
    dayNames: ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'],
    dayNamesShort: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
    dayNamesMin: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
    monthNames: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
    monthNamesShort: ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'],
    today: 'Сегодня',
    clear: 'Очистить',
    choose: 'Выбрать',
    accept: 'Да',
    reject: 'Нет',
    emptyMessage: 'Нет результатов',
    emptyFilterMessage: 'Ничего не найдено',
    searchMessage: '{0} результатов',
    selectionMessage: 'Выбрано: {0}',
    emptySelectionMessage: 'Ничего не выбрано',
    emptySearchMessage: 'Ничего не найдено',
  }
})
app.use(ToastService)
app.use(ConfirmationService)
app.directive('tooltip', Tooltip)
app.mount('#app')
