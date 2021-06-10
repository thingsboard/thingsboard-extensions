Extension ThingsBoard Platform
=====================

## Run project in development mode
 
```
cd ${TB_EXTENSION_WORK_DIR}/widgets
mvn clean install -P npm-start
```

In widgets library create a new widget. In the resources tab of the widget editor add this file:
```
static/widgets/thingsboard-extension-widgets.js
```

You also need to update the local UI TB settings. You need to replace the proxy settings in the file ui-ngx/proxy.conf.js with:
```
"/static/widgets": {
    "target": "http://localhost:5000",
    "secure": false,
}
```

## Run project in production mode

In widgets library create a new widget. In the resources tab of the widget editor add this file:
```
static/widgets/thingsboard-extension-widgets.js
```

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

## Build docker image with custom extension
Before building the docker image you have to choose the proper TB version, by default it has been set to 3.2.2 
ThingsBoard CE.
<br>
An example of setting version:
<br>
CE:
```
thingsboard/tb-node:3.2.2
```
PE:
```
store/thingsboard/tb-pe-node:3.2.2PE
```

To build a docker image with a custom extension inside, you need to specify the repository name, the image name and 
ThingsBoard version by executing following command:

```
mvn clean install -Ddockerfile.skip=false -Ddocker.repo=thingsboard -Ddocker.name=thingsboard-extension-docker -Dtb.edition=thingsboard/tb-node:3.2.2
```

To run the built image, please follow our official guides. <br>
CE:
```
https://thingsboard.io/docs/user-guide/install/cluster/docker-compose-setup/
```
PE:
```
https://thingsboard.io/docs/user-guide/install/pe/cluster/docker-compose-setup/
```
Once the guides successfully passed, please do the following. <br>
In case of CE you have to change the used image within docker-compose.yml to your local one. <br>
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
image: "YOUR_REPOSITORY_NAME/YOUR_IMAGE_NAME/YOUR_VERSION"
```
where <b><YOUR_VERSION></b> by default is <b>1.0.0-SNAPSHOT</b>. <br> It can be configured within parent pom.xml file 
in tag version.

In case of PE you have to perform the same steps as for CE, but to change the docker image 
within docker-compose.yml that locates within your installation type folder. <br> E.g. if you choose basic/monolith 
installation type then
the proper docker-compose.yml will be located at your_docker_directory/monolith/docker-compose.yml under 
<b>tb-monolith</b> property. <br>
For advanced installation type is the same as for CE and located under tb-core1 & tb-core2. 

Once the docker-compose.yml file has been updated, please restart ThingsBoard regard to our official guides. 