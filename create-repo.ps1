# Script to create GitHub repository and push code
# Usage: .\create-repo.ps1 -Username "YOUR_USERNAME" [-Token "YOUR_TOKEN"]

param(
    [Parameter(Mandatory=$true)]
    [string]$Username,
    
    [Parameter(Mandatory=$false)]
    [string]$Token
)

$RepoName = "Pakistan-vACC"
$Description = "Pakistan VATSIM Dashboard - Live tracking and historical data for OPKR/OPLR FIRs"

Write-Host "🚀 Creating GitHub repository: $RepoName" -ForegroundColor Cyan

# Create repository via GitHub API
if ($Token) {
    Write-Host "📡 Using GitHub API with token..." -ForegroundColor Yellow
    
    $headers = @{
        "Authorization" = "token $Token"
        "Accept" = "application/vnd.github.v3+json"
    }
    
    $body = @{
        name = $RepoName
        description = $Description
        private = $false
        auto_init = $false
    } | ConvertTo-Json
    
    try {
        $response = Invoke-RestMethod -Uri "https://api.github.com/user/repos" -Method Post -Headers $headers -Body $body -ContentType "application/json"
        Write-Host "✅ Repository created successfully!" -ForegroundColor Green
        Write-Host "   URL: $($response.html_url)" -ForegroundColor Gray
        
        # Add remote and push
        Write-Host "`n📤 Adding remote and pushing code..." -ForegroundColor Yellow
        git remote remove origin 2>$null
        git remote add origin "https://$Username@github.com/$Username/$RepoName.git"
        git push -u origin main
        
        Write-Host "`n✅ Done! Repository is live at:" -ForegroundColor Green
        Write-Host "   $($response.html_url)" -ForegroundColor Cyan
    } catch {
        Write-Host "❌ Error creating repository: $_" -ForegroundColor Red
        Write-Host "`nPlease create it manually at: https://github.com/new" -ForegroundColor Yellow
        Write-Host "Then run:" -ForegroundColor Yellow
        Write-Host "  git remote add origin https://github.com/$Username/$RepoName.git" -ForegroundColor Gray
        Write-Host "  git push -u origin main" -ForegroundColor Gray
    }
} else {
    Write-Host "⚠️  No token provided. Creating repository manually..." -ForegroundColor Yellow
    Write-Host "`nPlease:" -ForegroundColor Cyan
    Write-Host "  1. Go to: https://github.com/new" -ForegroundColor White
    Write-Host "  2. Repository name: $RepoName" -ForegroundColor White
    Write-Host "  3. Description: $Description" -ForegroundColor White
    Write-Host "  4. Choose Public or Private" -ForegroundColor White
    Write-Host "  5. DO NOT initialize with README, .gitignore, or license" -ForegroundColor White
    Write-Host "  6. Click 'Create repository'" -ForegroundColor White
    Write-Host "`nThen run:" -ForegroundColor Cyan
    Write-Host "  git remote add origin https://github.com/$Username/$RepoName.git" -ForegroundColor Gray
    Write-Host "  git push -u origin main" -ForegroundColor Gray
}

