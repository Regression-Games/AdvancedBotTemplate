if [ -z $GITHUB_REPO ]; then
  echo "
No repo to clone or push to. 

Please set 'GITHUB_REPO' in the Secrets panel to a GitHub repo git URL 
(e.g. https://github.com/Regression-Games/RGBotTemplate.git)

NOTE: This needs to be the https:// link, not git@... link

(Hint: The Secrets panel can be found by clicking the 'lock' 
button in the left menu)

"
  exit 1
else
  echo "Pushing all changes to '$GITHUB_REPO' (Want to push yourself? Need to pull and set an origin first? Use git commands directly in the console)
"
fi

if [[ "$GITHUB_REPO" != "https://"* ]]; then
  echo "Your GITHUB_REPO is not a valid https:// link. 
Make sure you copy the clone URL for HTTPS, not SSH."
  exit 1;
fi

# First, validate env vars
if [ -z "$GITHUB_EMAIL" ]; then
  echo "No GITHUB_EMAIL secret found. Please add the email you use on GitHub to the secrets pane in Replit, with a key of GITHUB_EMAIL."
  exit 1
fi
if [ -z "$GITHUB_USERNAME" ]; then
  echo "No GITHUB_USERNAME secret found. Please add your GitHub username you use on GitHub to the secrets pane in Replit, with a key of GITHUB_USERNAME."
  exit 1
fi
if [ -z "$GITHUB_TOKEN" ]; then
  echo "No GITHUB_TOKEN secret found. Please generate a token with all repo permissions at https://github.com/settings/tokens, and add this to the secrets pane in Replit with a key of GITHUB_TOKEN."
  exit 1
fi

git config --global credential.helper store
echo "https://$GITHUB_USERNAME:$GITHUB_TOKEN@github.com" > ~/.git-credentials
git config --global user.name "$GITHUB_USERNAME"
git config --global user.email "$GITHUB_EMAIL"

GIT_DIR=.git
if [ ! -d "$GIT_DIR" ]; then
    echo "Local git repo not initialized, adding..."
    git init
    git remote add origin "$GITHUB_REPO"
    git fetch
    git checkout -b main
fi

read -e -p "Commit message (default if blank): " COMMIT_MESSAGE

if [ -z "$COMMIT_MESSAGE" ]; then
  COMMIT_MESSAGE="Code changes from $(date +%F_%T)"
fi

git add .
git commit -m "$COMMIT_MESSAGE"
git push -u origin main