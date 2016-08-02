#!/bin/bash

# https://github.com/nwjs/nw.js/wiki/MAS:-Configuring-Info.plist
app_name="FoundFilm"
app_identifier="com.onhouseproduction.foundfilm" # com.companyname.appname
app_version="1.0.0" # readable app version
app_machine_version="100" # 100 == 1.0.0
app_copyright="Fuck Trump"
app_category="public.app-category.entertainment"
app_category2=""

app_build_folder="../Build" # where resulting app will be put
app_code_folder="../App" # where is nwjs app code
app_resources_folder="." # where to take Info.plist, icon
app_plist="$app_resources_folder/Info.plist"
app_icon="$app_resources_folder/app.icns"

#---------------------------

nwjs="/Applications/nwjs.app"

# Console colors
red='\033[0;31m'
green='\033[0;32m'
yellow='\033[1;33m'
NC='\033[0m'

#-------- Build  ---------

resulting_app_file="$app_build_folder/$app_name.app"
resulting_app_contents="./$resulting_app_file/Contents"
resulting_app_resources="$resulting_app_contents/Resources"

echo -e "Building ${green}$app_name${NC} into ${green}${resulting_app_file}${NC}"

# Remove old build
rm -r "$resulting_app_file" 2>/dev/null

echo "Copying nwjs.app ($nwjs)"
if [ ! -d $nwjs ]; then
	echo-red "$nwjs was not found"
	exit 1
fi
cp -R "$nwjs" "$resulting_app_file"

echo "Bundling app code ($app_code_folder)"
cp -R "$app_code_folder" "$resulting_app_resources/app.nw"

echo "Bundling Info.plist ($app_plist)"
cat "$app_plist" | \
	sed "s/__name__/$app_name/" | \
	sed "s/__bundle_identifier__/$app_identifier/" | \
	sed "s/__version__/$app_version/" | \
	sed "s/__bundle_version__/$app_machine_version/" | \
	sed "s/__copyright__/$app_copyright/" | \
	sed "s/__app_category__/$app_category/" | \
	sed "s/__app_sec_category__/$app_category2/" | \
	tee "$resulting_app_contents/Info.plist" >/dev/null

echo "Bundling app icon $app_icon"
sleep 1
cp "$app_icon" "$resulting_app_resources/app.icns"
# remove external attributes that may contain quarantine
# http://stackoverflow.com/a/4833168/1359178
xattr -c "$resulting_app_resources/app.icns"

# Remove localization or Finder will show nwjs instead of file name
# http://stackoverflow.com/a/37902023/1359178
[[ -d "$resulting_app_resources/en.lproj" ]] && \
	rm -r "$resulting_app_resources/en.lproj"

echo "Clearing icons cache"
sleep 1
touch "$resulting_app_file"
touch "$resulting_app_contents/Info.plist"

echo -e "${green}DONE${NC}"
echo "--------------"
read -p 'Run resulting app? [y/n]: ' answer
[[ "$answer" == "y" ]] && open "$resulting_app_file"
