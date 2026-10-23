# Store the initial ZDOTDIR value
LASPTERM_ZDOTDIR="$ZDOTDIR"

# Source the original zshenv
[ -f ~/.zshenv ] && source ~/.zshenv

# Detect if ZDOTDIR has changed
if [ "$ZDOTDIR" != "$LASPTERM_ZDOTDIR" ]; then
  # If changed, manually source your custom zshrc from the original LASPTERM_ZDOTDIR
  [ -f "$LASPTERM_ZDOTDIR/.zshrc" ] && source "$LASPTERM_ZDOTDIR/.zshrc"
fi