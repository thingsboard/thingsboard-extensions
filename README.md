Extension ThingsBoard Platform
=====================

## Build Project

```
cd ${TB_WORK_DIR}
mvn clean install -DskipTests
```

## Deploy project to customer server

```
cd ${TB_WORK_DIR}
scp widgets/target/thingsboard-extension-widgets-1.0.0-SNAPSHOT.jar ubuntu@${CUSTOMER}:~/.
ssh ${CUSTOMER}

sudo cp thingsboard-extension-widgets-1.0.0-SNAPSHOT.jar /usr/share/thingsboard/extensions/
sudo chown thingsboard:thingsboard /usr/share/thingsboard/extensions/thingsboard-extension-widgets-1.0.0-SNAPSHOT.jar
sudo service thingsboard restart
```

## Add file to resource

Login under system admin user to create a new widget. In the new widget add to resources these two files:
```
static/thingsboard-extension-widgets.js
static/thingsboard-extension-style.css
```
