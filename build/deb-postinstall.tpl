#!/bin/bash

if type update-alternatives 2>/dev/null >&1; then
    # Remove previous link if it doesn't use update-alternatives
    if [ -L '/usr/bin/laspterm' -a -e '/usr/bin/laspterm' -a "`readlink '/usr/bin/laspterm'`" != '/etc/alternatives/laspterm' ]; then
        rm -f '/usr/bin/laspterm'
    fi
    update-alternatives --install '/usr/bin/laspterm' 'laspterm' '/opt/Lasp/laspterm' 100 || ln -sf '/opt/Lasp/laspterm' '/usr/bin/laspterm'
else
    ln -sf '/opt/Lasp/laspterm' '/usr/bin/laspterm'
fi

chmod 4755 '/opt/Lasp/chrome-sandbox' || true

if hash update-mime-database 2>/dev/null; then
    update-mime-database /usr/share/mime || true
fi

if hash update-desktop-database 2>/dev/null; then
    update-desktop-database /usr/share/applications || true
fi
