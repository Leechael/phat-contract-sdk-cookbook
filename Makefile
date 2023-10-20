.PHONY: test

test:
	node get-cluster-info.js
	node get-cluster-info-asm-only.js
	node list-cluster.js
	node upload-asm-only.js
	node upload.js
