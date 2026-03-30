<script setup>
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'

// Randomise РЭНЕРА pattern vertical position on every page load
// (pattern is 417px tall relative to 1920px wide; full-screen cover
//  means it can shift up/down — 20–80% keeps it visually centred)
onMounted(() => {
  const pos = Math.round(20 + Math.random() * 60) // 20..80 %
  document.documentElement.style.setProperty('--pattern-pos', pos + '%')
})
</script>

<template>
  <RouterView />
</template>
