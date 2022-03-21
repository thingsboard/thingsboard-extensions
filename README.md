Extension ThingsBoard Platform
=====================
## ThingsBoard Dependencies
To add some of ThingsBoard dependencies imports to your "extension" Angular component,
please use this import structure:

```
import { <dependency> } from '<TB-module>/public-api';
```
"TB-module" - any of the following modules: 
```
@app/*
@core/*
@shared/*
@modules/*
@home/*
```
"dependency" - name of dependency/type located in "TB-module".
Refer to [modules-map](https://github.com/thingsboard/thingsboard-pe-ui-types/blob/master/src/app/modules/common/modules-map.ts)
to see what you can use.

Example: 

```
import { WidgetConfig } from '@shared/public-api';
```
## External Dependencies
In case you want to use your own dependencies package from the npm registry (unless you have specified another one in your package.json), you can easily add them to yarn packet manager running the next command:
```
yarn add <package-name>
```

Example: 

```
yarn add lodash
```
If it's not the npm/yarn registry, and you want to add it in another way, please refer to [yarn docs](https://classic.yarnpkg.com/en/docs/cli/add).

## Run project in development mode
```
cd ${TB_EXTENSION_WORK_DIR}/widgets
mvn clean install -P yarn-start
```
In widgets library create a new widget and in the resources tab of the widget editor add this file path:

```
http://localhost:5000/static/widgets/thingsboard-extension-widgets.js
```
You must also check "Is module"

## Build project

```
cd ${TB_EXTENSION_WORK_DIR}
mvn clean install -DskipTests
```

## Deploy project to customer server

```
cd ${TB_EXTENSION_WORK_DIR}
scp widgets/target/thingsboard-extension-widgets-1.0.0-SNAPSHOT.jar ubuntu@${CUSTOMER}:~/.
ssh ${CUSTOMER}

sudo cp thingsboard-extension-widgets-1.0.0-SNAPSHOT.jar /usr/share/thingsboard/extensions/
sudo chown thingsboard:thingsboard /usr/share/thingsboard/extensions/thingsboard-extension-widgets-1.0.0-SNAPSHOT.jar
sudo service thingsboard restart
```

## Run project in production mode

In widgets library create a new widget. In the resources tab of the widget editor add this file path:
```
static/widgets/thingsboard-extension-widgets.js
```
You must also check "Is module"

## Build docker image with custom extension
Before building the docker image you have to choose the proper TB version, by default it has been set to 3.3.4 
ThingsBoard CE.
<br>
An example of setting version:
<br>
CE:
```
thingsboard/tb-node:3.3.4
```
PE:
```
store/thingsboard/tb-pe-node:3.3.4.1PE
```

To build a docker image with a custom extension inside, you need to specify the repository name, the image name and 
ThingsBoard version by executing following command:

```
mvn license:format clean install -Ddockerfile.skip=false -Ddocker.repo=thingsboard -Ddocker.name=thingsboard-extension-docker -Dtb.edition=thingsboard/tb-node:3.3.2
```
where
```
-Ddocker.repo= - the repository name in your dockerhub
-Ddocker.name= - the name of your image
-Dtb.edition=  - your ThingsBoard edititon (CE/PE) chosen from the example above
```

To run the built image, please follow our official guides. <br>
CE:
```
https://thingsboard.io/docs/user-guide/install/cluster/docker-compose-setup/
```

<b>NOTE:</b> Don't forget to do
<b>git checkout v3.3.4</b> <br>
Otherwise, you will hit the error messages related to the unreleased features

PE:
```
https://thingsboard.io/docs/user-guide/install/pe/cluster/docker-compose-setup/
```
Once the guides successfully passed, please do the following. <br>
In case you use CE you have to change the used image within docker-compose.yml to your local one. <br>
Open the docker-compose.yml:

```
nano docker-compose.yml
```

Under tb-core1 & tb-core2 you will see:
```
image: "${DOCKER_REPO}/${TB_NODE_DOCKER_NAME}:${TB_VERSION}"
```
change it to 
```
image: "thingsboard/thingsboard-extension-docker:1.0.0-SNAPSHOT"
```
where <b><YOUR_VERSION></b> by default is <b>1.0.0-SNAPSHOT</b>. <br> It can be configured within parent pom.xml file 
in tag version.

In case you use PE you have to perform the same steps as for CE, but to change the docker image 
within docker-compose.yml that is located within your installation type folder. <br> E.g. if you choose basic/monolith 
installation type then
the proper docker-compose.yml will be located at your_docker_directory/monolith/docker-compose.yml under 
<b>tb-monolith</b> property. <br>
For advanced installation type is the same as for CE and located under tb-core1 & tb-core2. 

Once the docker-compose.yml file has been updated, please restart ThingsBoard regard to our official guides. 
