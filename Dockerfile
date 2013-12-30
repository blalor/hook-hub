FROM blalor/centos-supervised:latest

MAINTAINER Brian Lalor <blalor@bravo5.org>

EXPOSE 7000

RUN \
    yum -y install nodejs-0.10.24-1 && yum clean all

## ugly; this is what happens when you don't have released packages!
ADD . /src
RUN cd /src && \
    npm install && \
    node_modules/.bin/grunt prepare_install tar-package && \
    tar -xzf target/hook-hub-*.tar.gz -C /srv/ && \
    rm -rf /src && \
    echo -e '[program:hook-hub]\ncommand = node  /srv/hook-hub/lib/node_modules/hook-hub/server.js' > /etc/supervisor.d/program-hook-hub.conf
    
