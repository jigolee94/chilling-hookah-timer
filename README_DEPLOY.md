# 칠링 후카 타이머

## GitHub 업로드 방법

1. ZIP 파일을 다운로드하고 압축을 풉니다.
2. `chilling-hookah-timer` 폴더 안으로 들어갑니다.
3. GitHub 저장소에서 `Add file` → `Upload files`를 누릅니다.
4. 아래 파일/폴더를 전부 업로드합니다.

```text
package.json
index.html
vite.config.js
tailwind.config.js
postcss.config.js
README_DEPLOY.md
src
public
```

`chilling-hookah-timer` 폴더 자체를 올리지 말고, 그 안의 파일/폴더를 올리세요.

## Vercel 설정

- Framework Preset: Vite
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`
