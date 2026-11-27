import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/ritmo/`,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // Viewport de celular com Chromium (mesmo navegador, tela e toque de um Android)
    { name: 'celular', use: { ...devices['Pixel 7'] } },
    // Motor do Safari (WebKit) com o perfil do iPhone. Só com WEBKIT=1 (job próprio no CI),
    // porque o navegador WebKit não vem instalado em todo ambiente.
    ...(process.env.WEBKIT
      ? [
          {
            name: 'iphone',
            use: { ...devices['iPhone 13'] },
            // O Playwright só intercepta service workers e simula modo offline com eles no
            // Chromium; os testes do app offline rodam nos outros dois projetos.
            testIgnore: /pwa\.spec\.js/,
          },
        ]
      : []),
  ],
  webServer: {
    command: 'node scripts/serve.js',
    env: { PORT: String(PORT) },
    url: `http://localhost:${PORT}/ritmo/`,
    reuseExistingServer: !process.env.CI,
  },
});
