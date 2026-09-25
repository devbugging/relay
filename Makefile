CODE ?= "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"

.PHONY: run build watch typecheck install package install-extension clean

install:
	npm install

build:
	npm run build

typecheck:
	npm run typecheck

watch:
	npm run watch

# Builds, then launches an Extension Development Host with this extension loaded.
run: build
	$(CODE) --extensionDevelopmentPath=$(CURDIR) $(CURDIR)

# Builds relay.vsix: the production bundle plus the Agent SDK it loads at runtime.
package:
	npx vsce package --allow-missing-repository --skip-license --no-rewrite-relative-links --out relay.vsix

# Installs relay.vsix into your regular VS Code; reload open windows to pick it up.
install-extension: package
	$(CODE) --install-extension relay.vsix --force

clean:
	rm -rf dist
