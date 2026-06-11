/**
 * useExpanded — раскрытие карточки графика в полноэкранный оверлей.
 *
 * Маленькие карточки неудобны для анализа: composable даёт состояние
 * expanded + toggle, вешает Esc-выход и блокирует прокрутку страницы,
 * пока график развёрнут. Контейнер при expanded телепортируется в body
 * (fixed внутри glass-карточек с backdrop-filter иначе оказался бы заперт
 * в их containing block).
 */
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'

export function useExpanded() {
  const expanded = ref(false)

  function toggle() {
    expanded.value = !expanded.value
  }

  watch(expanded, (on) => {
    if (typeof document !== 'undefined') {
      document.body.style.overflow = on ? 'hidden' : ''
    }
  })

  function onKey(e) {
    if (e.key === 'Escape' && expanded.value) expanded.value = false
  }

  onMounted(() => window.addEventListener('keydown', onKey))
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKey)
    if (typeof document !== 'undefined') document.body.style.overflow = ''
  })

  return { expanded, toggle }
}
