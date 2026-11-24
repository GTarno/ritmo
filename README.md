# Ritmo

Diário pessoal de academia em português do Brasil: planejar a semana, registrar treinos, acompanhar cargas, medidas e frequência. Aplicação estática, dados salvos só no navegador.

- **Plano de desenvolvimento:** [docs/PLANO.md](docs/PLANO.md)
- **Site:** https://gtarno.github.io/ritmo/ (publicado automaticamente a cada push na `main`)

## Rodar localmente

Sem build. Sirva a pasta `app/` com qualquer servidor estático:

```bash
npx serve app
```

## Publicação

O workflow `.github/workflows/pages.yml` publica `app/` no GitHub Pages. Configuração única: **Settings → Pages → Source: GitHub Actions**.
