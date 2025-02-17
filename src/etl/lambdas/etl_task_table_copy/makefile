include ../../../make_variables

dirs = build
.PHONY: $(dirs) init plan apply destroy prebuild local clean

SRC_DIR := ./deploy
DEST_DIR := ./build
TFFILES := config.tf datablocks.tf backend.tf local.tfvars variables.tf makefile

code_files = ./*.js ./package.json

TF_TARGS := $(patsubst %,$(DEST_DIR)/%,$(TFFILES))

prebuild:
	mkdir -p ./build

$(DEST_DIR)/%: $(SRC_DIR)/% ../../../make_variables
	python3 ../../../scripts/vreplace.py -f ../../../make_variables $< $@

init: prebuild $(TF_TARGS)
	$(MAKE) -C build $(MAKECMDGOALS)
	@rm -f *.instance
	@touch $(INSTANCE).instance		# Marker file to display the instance name

function.zip: $(code_files)
	rm -f ./function.zip
	zip -r9q function.zip $(code_files)

plan: function.zip $(TF_TARGS) $(dirs)
apply: function.zip $(TF_TARGS) $(dirs)
apply-y: function.zip $(TF_TARGS) $(dirs)
destroy: $(TF_TARGS) $(dirs)

node_modules: ./package.json
	npm install

local: node_modules
	node local.js

clean:
	rm -f *.instance
	\rm -Rf build function.zip node_modules

$(dirs):
	$(MAKE) -C $@ $(MAKECMDGOALS)