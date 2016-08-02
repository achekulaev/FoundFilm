#!/bin/bash

# https://github.com/nwjs/nw.js/wiki/MAS:-Configuring-Info.plist
app_name="FoundFilm"
app_identifier="com.onhouseproduction.foundfilm" # com.companyname.appname
app_version="1.0.0" # readable app version
app_machine_version="100" # 100 == 1.0.0
app_copyright="Fuck Trump"
app_category="public.app-category.entertainment"
app_category2=""

app_folder="../App"			# where nwjs app code lives
app_resources_folder="."    # where to take Info.plist, icons, en.lproj
app_build_folder="../Build" # where resulting app will be put

#---------------------------

nwjs="/Applications/nwjs.app"

# Console colors
red='\033[0;31m'
green='\033[0;32m'
yellow='\033[1;33m'
NC='\033[0m'

echo-red () { echo -e "${red}$1${NC}"; }
echo-green () { echo -e "${green}$1${NC}"; }
echo-yellow () { echo -e "${yellow}$1${NC}"; }

if_failed ()
{
	if [ ! $? -eq 0 ]; then
		if [[ "$1" == "" ]]; then msg="dsh: error"; else msg="$1"; fi
		echo-red "dsh: $msg";
		exit 1;
	fi
}

#-------- Build  ---------

resulting_app_file="$app_build_folder/$app_name.app"
resulting_app_contents="./$resulting_app_file/Contents"
resulting_app_resources="$resulting_app_contents/Resources"

echo -e "Building ${green}$app_name${NC} into ${green}${resulting_app_file}${NC}..."

echo "Cleanup"
rm -r "$resulting_app_file" 2>/dev/null

echo "Copying nwjs.app"
if [ ! -d $nwjs ]; then
	echo-red "$nwjs was not found"
	exit 1
fi
cp -R "$nwjs" "$resulting_app_file"

echo "Bundling $app_name"
cp -R "$app_folder" "$resulting_app_resources/app.nw"
# sed -i "" "s/Drude Watch-dev/Drude Watch/" "$resulting_app_resources/app.nw/package.json"

echo "Bundling Info.plist"
cat "$app_resources_folder/Info.plist" | \
	sed "s/__name__/$app_name/" | \
	sed "s/__bundle_identifier__/$app_identifier/" | \
	sed "s/__version__/$app_version/" | \
	sed "s/__bundle_version__/$app_machine_version/" | \
	sed "s/__copyright__/$app_copyright/" | \
	sed "s/__app_category__/$app_category/" | \
	sed "s/__app_sec_category__/$app_category2/" | \
	tee "$resulting_app_contents/Info.plist" >/dev/null

# remove localization or Finder will show nwjs instead of file name
# http://stackoverflow.com/a/37902023/1359178
echo "Removing en.lproj"
rm -r "$resulting_app_resources/en.lproj"

#echo-green "Bundling nw.icns"
cp "$app_resources_folder/app.icns" "$resulting_app_resources/app.icns"
xattr -c "$resulting_app_resources/app.icns"

echo "Clearing icons cache"
touch "$resulting_app_file"
touch "$resulting_app_contents/Info.plist"

echo-green "DONE"
echo "--------------"
echo "Press enter to try running resulting app or Ctrl+C to finish build."
read -p ''
open "$resulting_app_file"
