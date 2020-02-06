Extension ThingsBoard Platform
=====================

## Run project in development mode
 
```
cd ${TB_EXTENSION_WORK_DIR}/widgets
mvn clean install -P npm-start
```

In widgets library create a new widget. In the resources tab of the widget editor add these two files:
```
http://localhost:5000/thingsboard-extension-widgets.js
http://localhost:5000/thingsboard-extension-style.css
```

## Run project in production mode

In widgets library create a new widget. In the resources tab of the widget editor add these two files:
```
static/thingsboard-extension-widgets.js
static/thingsboard-extension-style.css
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
