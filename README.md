# Hook-Hub

A simple pub/sub hub for webhooks.

I needed a relatively generic way to connect disparate systems via webhooks, but
couldn't find anything that already existed.  There are some really interesting
pub/sub tools available, but some were too complicated and/or heavy
([PubSubHubbub][PuSH]), and others were too tied to their own standards
([Faye][Faye]).  What I *really* want is an open-source version of
[Zapier][Zapier] or [IFTTT][IFTTT], and Hook-Hub may eventually grow into that,
but for now it's little more than a dumb reflector. Requests submitted (via
`POST` or `GET`) to a publish endpoint are `POST`ed to subscribed callbacks. No
translation of headers or body is performed.  You may wish to have your
monitoring service (like [Zabbix][Zabbix]) hit a Hook-Hub publishing endpoint
and have the request re-broadcast to [Hubot][Hubot] for chatroom notifications,
and also to something like [Pagerduty][Pagerduty] to directly contact a person.
Since no translation of the initial publish event is performed, the recipients
will have to have knowledge of the payload.

This is not intended for use in an untrusted environment.  No provisions for
preventing DoS-attacks are made, no verification of publishers or subscribers is
attempted, etc.

## tags

Subscriptions are connected to publish events by tags.  When a publish endpoint
is created, a list of tags is associated.  When a subscription is created, a
list of tags is provided indicating which types of publish events should be
received.  Publish endpoints may have more than one tag, and subscriptions may
be for more than one tag.  All subscribers whose tags intersect with the tags
associated with the endpoint will receive the publish event.

## scenario

Create a publish endpoint with a description and a set of tags:

    # curl -is \
        -X POST \
        -H 'Content-Type: application/json' \
        -d '{
            "description":"my first publish endpoint",
            "type": "zabbix",
            "tags":["alerts", "env:prod"]
        }' \
        http://localhost:7000/endpoint
    
    HTTP/1.1 200 OK
    Content-Type: application/json
    Content-Length: 38
    Date: Sun, 16 Jun 2013 22:15:47 GMT
    Connection: keep-alive
    
    "d15db67d-e55a-447a-a104-9df1cc08509e"

Create a subscription for all alerts:

    # curl -is \
        -X POST \
        -H 'Content-Type: application/json' \
        -d '{
            "description":"all alerts",
            "tags":["alerts"],
            "handler": {
                "name": "pass-through",
                "config": {
                    "callback": "http://requestb.in/13j7v3d1"
                }
            }
        }' \
        http://localhost:7000/subscription
    
    HTTP/1.1 200 OK
    Content-Type: application/json
    Content-Length: 38
    Date: Sun, 16 Jun 2013 22:20:49 GMT
    Connection: keep-alive
    
    "22044517-1199-44c1-a200-1d82229a0403"

Publish something:

    # curl -is \
        -X POST \
        -H 'Content-Type: application/json' \
        -d '{
            "type": "cpu",
            "message": "the cpu is too damn high!"
        }' \
        http://localhost:7000/publish/d15db67d-e55a-447a-a104-9df1cc08509e
    
    HTTP/1.1 204 No Content
    Date: Sun, 16 Jun 2013 22:22:40 GMT
    Connection: keep-alive

The callback URL given for the subscription will receive the request:

    POST /13j7v3d1 HTTP/1.1
    X-Hookhub-Tags: alerts,env:prod
    X-Hookhub-Subscription-Id: 22044517-1199-44c1-a200-1d82229a0403
    User-Agent: restify/2.5.1 (x64-darwin; v8/3.14.5.8; OpenSSL/1.0.1e) node/0.10.1
    Host: requestb.in
    Date: Sun, 16 Jun 2013 22:22:40 GMT
    Content-Type: application/json
    Content-Md5: uWiKSBFEb5xpi97XagXiIg==
    Content-Length: 52
    Connection: close
    Accept: application/json
    
    {"type":"cpu","message":"the cpu is too damn high!"}

Any number of subscriptions can exist for any set of tags.  Publishing can also
be done via a GET, in which case the query parameters will be converted to a
JSON object.

## routes

* `POST /endpoint` -- create a new endpoint
* `GET /endpoint/:id` -- retrieve details for an endpoint
* `DELETE /endpoint/:id` -- delete an endpoint
* `POST /subscription` -- create a new subscription
* `GET /subscription/:id` -- retrieve details for a subscription
* `DELETE /subscription/:id` -- delete a subscription
* `GET|POST /publish/:id` -- publish to an existing endpoint

## requirements

An unsecured Redis instance running on `localhost:6379`, for persistence.

[PuSH]: https://code.google.com/p/pubsubhubbub/
[Faye]: http://faye.jcoglan.com
[Zapier]: https://zapier.com
[IFTTT]: https://ifttt.com
[Zabbix]: http://www.zabbix.com
[Hubot]: http://hubot.github.com
[Pagerduty]: http://www.pagerduty.com
