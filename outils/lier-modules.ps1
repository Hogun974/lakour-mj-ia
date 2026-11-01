# Relie les modules et systèmes d'un dépôt La Kour dans le Foundry LOCAL (jonctions, pas besoin d'être administrateur).
# - lancé depuis un dépôt de monde (lakour-w40k, lakour-warcraft, lakour-veillees) : chaque dossier de modules\
#   (dont le sous-module modules\lakour-mj-ia) va dans Data\modules, et chaque dossier de systems\ dans Data\systems ;
# - lancé depuis le dépôt lakour-mj-ia lui-même : sa racine (le module) devient Data\modules\lakour-mj-ia.
# Usage (à la racine du dépôt) : powershell -File modules\lakour-mj-ia\outils\lier-modules.ps1 [-DataPath C:\FoundryDev]
#                                powershell -File outils\lier-modules.ps1 [-DataPath C:\FoundryDev]   (dépôt du moteur)
param(
  [string]$DataPath = "C:\FoundryDev",
  [string]$Depot = (Get-Location).Path
)

function Lier([string]$source, [string]$cible) {
  New-Item -ItemType Directory -Force (Split-Path $cible) | Out-Null
  $nom = Split-Path $cible -Leaf
  if (Test-Path $cible) {
    Write-Output "déjà relié : $nom"
  } else {
    New-Item -ItemType Junction -Path $cible -Target $source | Out-Null
    Write-Output "relié      : $nom -> $cible"
  }
}

$modules = Join-Path $Depot "modules"
$systemes = Join-Path $Depot "systems"
if (Test-Path $modules) {
  Get-ChildItem $modules -Directory | ForEach-Object { Lier $_.FullName (Join-Path $DataPath "Data\modules\$($_.Name)") }
  if (Test-Path $systemes) {
    Get-ChildItem $systemes -Directory | ForEach-Object { Lier $_.FullName (Join-Path $DataPath "Data\systems\$($_.Name)") }
  }
} elseif (Test-Path (Join-Path $Depot "module.json")) {
  $id = (Get-Content (Join-Path $Depot "module.json") -Raw | ConvertFrom-Json).id
  Lier (Resolve-Path $Depot).Path (Join-Path $DataPath "Data\modules\$id")
} else {
  Write-Error "Ni modules\ ni module.json dans $Depot : lancer depuis la racine d'un dépôt La Kour."
  exit 1
}
