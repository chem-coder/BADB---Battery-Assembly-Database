import { ref } from 'vue'

export function useStatus() {
  const statusMsg = ref('')
  const statusError = ref(false)

  function showStatus(msg, isError = false) {
    statusMsg.value = msg
    statusError.value = isError
    setTimeout(() => { statusMsg.value = '' }, 1200)
  }

  return { statusMsg, statusError, showStatus }
}
