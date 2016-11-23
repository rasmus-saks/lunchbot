var pmx = require('pmx');
pmx.init();
var Slack = require("slack-client");
var request = require('request');
var Entities = require("html-entities").AllHtmlEntities;
var entities = new Entities();
var cheerio = require('cheerio');
var LUNCH_URL = "http://www.paevapraed.com/";
var schedule = require('node-schedule');
var storage = require('node-persist');
var parser = require("chatcommand-parser");
p = new parser.Parser();
p.addCommand("lunch list");
p.addCommand("lunch get").addArgument("place");
p.addCommand("lunch default").addArgument(parser.argument.list("method", "add", "del", "set"));
p["lunch default"].addArgument(parser.argument.all("places"));
p.addCommand("lunch");
storage.init();

//Fill in your slack token here :D
var tokens = ["SLACK-TOKEN-HERE"];
for (var i = 0; i < tokens.length; i++) {
  (function () {
    var token = tokens[i];
    const bot = new Slack(token, true, true);
    const channelName = "lunch";

    bot.login();
    var job;

    function getLunchMessage($, place) {
      var msg = "";
      msg += "\n\n*" + $("#" + place + "_ALL .diner_link").text() + "* _" + $("#" + place + "_ALL .diner_link_small").text() + "_\n";
      msg += "```" + entities.decode($("#" + place + "_FOOD").html()).replace(/<br>/g, "\n") + "```";
      return msg;
    }

    function postLunches(channel, places) {
      request(LUNCH_URL, function (error, response, html) {
        var $ = cheerio.load(html);
        var msg = "*Today's lunch:*";
        for (var i = 0; i < places.length; i++) {
          msg += getLunchMessage($, places[i]);
        }
        channel.send(msg);
      });
    }

    function removeA(arr) {
      var what, a = arguments, L = a.length, ax;
      while (L > 1 && arr.length) {
        what = a[--L];
        while ((ax = arr.indexOf(what)) !== -1) {
          arr.splice(ax, 1);
        }
      }
      return arr;
    }

    bot.on("open", function () {
      var channel = bot.getChannelByName(channelName);
      job = schedule.scheduleJob('0 12 * * 1-5', function () {
        var places = storage.getItem(bot.team.name + '_places');
        postLunches(channel, places);
      });
      var places = storage.getItem(bot.team.name + '_places');
      if (places === undefined) {
        storage.setItem(bot.team.name + '_places', []);
      }
    });
    bot.on('message', function (message) {
      var channel = bot.getChannelGroupOrDMByID(message.channel);
      var places = storage.getItem(bot.team.name + '_places');
      if (message.type !== "message") return;
      if (!message.text) return;
      var res = p.parse(message.text);
      if (!res) return;
      if (res.command === "lunch") {
        postLunches(channel, places);
      }
      if (res.command === "lunch list") {
        request(LUNCH_URL, function (error, response, html) {
          var $ = cheerio.load(html);
          var msg = "All available lunch places:";
          var lunchplaces = JSON.parse($("#ALL_DINERS").attr("data-json"));
          msg += "\n";
          msg += "`" + lunchplaces.join(", ") + "`\n";
          msg += "Use *!lunch get [place]* to get the lunch of a specific place today.";
          channel.send(msg);
        });
      }
      if (res.command === "lunch get") {
        var place = res.args.place.toUpperCase();
        request(LUNCH_URL, function (error, response, html) {
          var $ = cheerio.load(html);
          var msg = "";
          var lunchplaces = JSON.parse($("#ALL_DINERS").attr("data-json"));
          if (lunchplaces.indexOf(place) >= 0) {
            msg = getLunchMessage($, place);
          } else {
            msg = "Unknown lunch place `" + place + "`!";
          }
          channel.send(msg);
        });
      }
      if (res.command === "lunch default") {
        var pls = res.args.places.toUpperCase();
        var method = res.args.method.toUpperCase();
        if (pls.length === 0) {
          channel.send("Current default places:\n`" + places.join(", ") + "`");
          channel.send("Use *!lunch default [add|del|set] [place1 place2 ...]* to edit the default lunch places");
        } else {
          var plslist = pls.split(" ");
          if (plslist.length < 2 || !(method === "SET" || method === "ADD" || method === "DEL")) {
            channel.send("Use *!lunch default [add|del|set] [place1 place2 ...]* to edit the default lunch places");
            return;
          }
          request(LUNCH_URL, function (error, response, html) {
            var $ = cheerio.load(html);
            var lunchplaces = JSON.parse($("#ALL_DINERS").attr("data-json"));
            for (var i = 1; i < plslist.length; i++) {
              if (lunchplaces.indexOf(plslist[i]) === -1) {
                channel.send("Unknown lunch place `" + plslist[i] + "`!");
                return;
              }
            }
            var msg = "";
            if (method === "SET") {
              places = plslist;
            } else if (method === "ADD") {
              for (var j = 1; j < plslist.length; j++) {
                places.push(plslist[j]);
              }
              msg = "Added `" + plslist.slice(1).join(", ") + "` to default lunch places!";
            } else if (plslist[0] === "DEL") {
              for (var k = 1; k < plslist.length; k++) {
                removeA(places, plslist[k]);
              }
              msg = "Deleted `" + plslist.slice(1).join(", ") + "` from default lunch places!";
            }
            places = places.sort();
            storage.setItem(bot.team.name + '_places', places);
            channel.send(msg + "\nCurrent default lunch places:\n`" + places.join(", ") + "`");
          });

        }
      }
    });
  })();
}

