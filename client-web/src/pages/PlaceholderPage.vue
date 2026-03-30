<template>
  <div class="placeholder-page">
    <i class="pi pi-clock" style="font-size: 3rem; color: #ccc"></i>
    <h2>{{ $route.meta.title }}</h2>
    <p>Страница будет доступна в следующей версии.</p>
  </div>
</template>

<style scoped>
.placeholder-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  color: #6B7280;
  text-align: center;
}

.placeholder-page h2 {
  margin: 1rem 0 0.5rem;
  color: #003366;
}

.placeholder-page p {
  font-size: 14px;
}
</style>
