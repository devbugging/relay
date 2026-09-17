CODE ?= "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"

.PHONY: run build watch typecheck install clean

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

clean:
	rm -rf dist
