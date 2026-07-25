# Revertir mejoras visuales premium por fase o por completo.
#
# Uso:
#   .\scripts\revert-visual-premium.ps1              # vuelve a main (descarta rama)
#   .\scripts\revert-visual-premium.ps1 -List       # lista commits de la rama
#   .\scripts\revert-visual-premium.ps1 -Phase 2    # revierte commits desde fase 2
#   .\scripts\revert-visual-premium.ps1 -KeepBranch # checkout main sin borrar rama
#
param(
  [int]$Phase = 0,
  [switch]$List,
  [switch]$KeepBranch
)

$Branch = "feat/visual-premium-phases"
$Main = "main"

function Get-PhaseCommits {
  git log --oneline $Main..HEAD 2>$null
}

if ($List) {
  Write-Host "[i] Commits en $Branch (no en $Main):" -ForegroundColor Cyan
  Get-PhaseCommits
  exit 0
}

$current = git branch --show-current
if ($current -ne $Branch) {
  Write-Host "[!] No estas en $Branch (actual: $current). Cambia con: git checkout $Branch" -ForegroundColor Yellow
  exit 1
}

if ($Phase -gt 0) {
  $marker = "visual(p$Phase)"
  $commit = git log --oneline --grep="$marker" -1 --format="%H" 2>$null
  if (-not $commit) {
    Write-Host "[!] No se encontro commit con marcador '$marker'. Usa -List para ver commits." -ForegroundColor Red
    exit 1
  }
  Write-Host "[i] Revirtiendo hasta antes de fase $Phase (commit padre de $commit)..." -ForegroundColor Cyan
  git revert --no-commit "$commit..HEAD" 2>$null
  if ($LASTEXITCODE -ne 0) {
    git reset --hard "($commit)^"
  }
  Write-Host "[OK] Revertido. Revisa con git status y haz commit si hace falta." -ForegroundColor Green
  exit 0
}

Write-Host "[i] Volviendo a $Main y descartando cambios de $Branch..." -ForegroundColor Cyan
git checkout $Main
if (-not $KeepBranch) {
  git branch -D $Branch 2>$null
  Write-Host "[OK] Rama $Branch eliminada. Estas en $Main." -ForegroundColor Green
} else {
  Write-Host "[OK] Estas en $Main. Rama $Branch conservada." -ForegroundColor Green
}
