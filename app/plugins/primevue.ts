import PrimeVue from 'primevue/config'

export default defineNuxtPlugin((nuxtApp) => {
  // Use PrimeVue's behavior/components with the existing LearnPurse design.
  // No remote theme assets or client-only stylesheet injection is needed.
  nuxtApp.vueApp.use(PrimeVue, { unstyled: true })
})
