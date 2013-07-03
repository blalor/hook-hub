# Hook-Hub

A simple pub/sub hub for webhooks.

I needed a relatively generic way to connect disparate systems via webhooks, but
couldn't find anything that already existed.  There are some really interesting
pub/sub tools available, but some were too complicated and/or heavy
([PubSubHubbub][PuSH]), and others were too tied to their own standards
([Faye][Faye]).  What I *really* want is an open-source version of
[Zapier][Zapier] or [IFTTT][IFTTT], and Hook-Hub can eventually grow into that.
Requests submitted (via `POST` or `GET`) to a publish endpoint are `POST`ed to
pluggable subscribers. Subscribers can then interface natively with other
services, reformat and republish to other webhooks, etc.

You may wish to have your monitoring service (like [Zabbix][Zabbix]) hit a Hook-
Hub publishing endpoint and have the request re-broadcast to [Hubot][Hubot] for
chatroom notifications, and also to something like [Pagerduty][Pagerduty] to
directly contact a person.

This is not intended for use in an untrusted environment.  No provisions for
preventing DoS-attacks are made, no verification of publishers or subscribers is
attempted, etc.

Any number of subscriptions can exist for any set of types and tags.  Publishing
can also be done via a GET, in which case the query parameters will be converted
to a JSON object.

## type and tags

Events and subscribers are connected via types and tags.  Each published event
has a `type` (inherited from the endpoint configuration) and one or more `tags`.
Each subscriber registers for events of a given type, as well as an optional set
of tags which -- if provided -- must be a subset of the published event's tags
in order to be matched.  This is inspired by [Logstash][logstash]'s types and
tags system for connecting inputs, filters, and outputs.

## scenario: pass-through

Each event is passed through to all subscribers with no translation.

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

Create a subscription that will forward all events of type `zabbix` tagged with
`alerts` to a configured endpoint:

    # curl -is \
        -X POST \
        -H 'Content-Type: application/json' \
        -d '{
            "description":"zabbix alerts",
            "type": "zabbix",
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


## scenario: convert using subscriber modules

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

Register the `zabbix-to-hubot-say` module as a subscriber, which will publish
new events with a type of `hubot-say`:

    # curl -is \
        -X POST \
        -H 'Content-Type: application/json' \
        -d '{
            "description":"convert zabbix alerts to hubot-say types",
            "type": "zabbix",
            "handler": {
                "name": "zabbix-to-hubot-say"
            }
        }' \
        http://localhost:7000/subscription

Register the `hubot-say` module as a subscriber; it will send a `GET` request to
the configured URL, which should be the handler for [hubot-say][hubotsay] in
your hubot instance:

    # curl -is \
        -X POST \
        -H 'Content-Type: application/json' \
        -d '{
            "description":"have hubot say stuff",
            "type": "hubot-say",
            "handler": {
                "name": "hubot-say",
                "config": {
                    "hubot_url": "http://my.hubot.local/say"
                }
            }
        }' \
        http://localhost:7000/subscription

Now post an alert in the format that your Zabbix server should; you should see
the `trigger.name` value show up in the room Hubot's in:

    # curl -is \
        -X POST \
        -H 'Content-Type: application/json' \
        -d '{
            "trigger": {
                "name": "Low free disk space on my-troublesome-host volume /",
                "severity": "High",
                "status": "PROBLEM"
            },
            "items": [
                {
                    "host": "my-troublesome-host",
                    "id": "130812",
                    "key": "vfs.fs.size[/,pfree]",
                    "name": "Free disk space on / in %",
                    "value": "10 %"
                }
            ]
        }' \
        http://localhost:7000/publish/d15db67d-e55a-447a-a104-9df1cc08509e

## custom subscriber modules

Check out the examples in [`lib/subscribers`](lib/subscribers).  They're
registered by relative module name in `handler.name`.

## ad-hoc reformatting

This is dangerous as hell, but I've tried to make it safe.  The `transmogrify`
handler will execute arbitrary JavaScript in a [sandbox][sandcastle].  The only
function available is `publish(type, tags, data)`.  You can use it to generate
one or more events from a matched input.

Assume the following event is published with the `foo` type:

    { bar: "baz" }

Now create a subscription:

    {
        "description": "sample transmogrifier",
        "tags": [],
        "type": "foo",
        "handler": {
            "name": "transmogrify",
            "config": {
                "script": "function(sub_tags, pub_tags, data) { publish(\"doeet\", pub_tags, { message: data.bar }); }"
            }
        }
    }

This will result in a new event being published with type `doeet` and 
`{ message: "baz" }` for the payload, and carrying along any tags provided by
the original publisher.

The evaulated JavaScript should be completely sandboxed and is unable to call
`require`, `console.log`, `setTimeout` or pretty much anything else you might
find in a normal JavaScript environment, so it's pretty safe.  Plus any script
that takes longer than 5 seconds will be terminated.  Please note the wiggle
words in this paragraph.  You've been warned.

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
[hubotsay]: https://github.com/github/hubot-scripts/blob/master/src/scripts/http-say.coffee
[sandcastle]: https://github.com/bcoe/sandcastle
