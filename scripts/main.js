import * as server from "@minecraft/server"
import * as ui from "@minecraft/server-ui"

const Player = server.Player;

let debugMode = false //デバッグ用

//変数宣言
let nowPlaying = false
let loopId1 = null;
let oniGlobal = null
let nowLoading = false
let timeGlobal = 300
let waiting = false
let waitNextOniLoop = null
let lobbyData = [0, 60, 0]
let stageData = [100, 60, 100]

debugMode && server.world.sendMessage("スクリプト読み込み成功！");

//職業登録
let classIdOni = ["iceoni"]
let classIdNige = ["runner"]
let classData = {}
let classUsedItem = {}

let classIdList = classIdOni.concat(classIdNige) //全体配列に登録
classData = {
                iceoni:{name:"氷鬼", useItem:"minecraft:ice", runCommand:"function iceoniruncommand",count:3, isOni:true},
                runner:{name:"ランナー", useItem:"minecraft:diamond", runCommand:"function runnerruncommand",count:3, isOni:false}
            }

for (let i = 0; i < classIdList.length; i++) {
    let rawData = classData[`${classIdList[i]}`];
    classUsedItem[`${classIdList[i]}`] = rawData.useItem
    console.log(`職業：${rawData.name}の登録が完了しました`)
}

//職業動作
server.world.afterEvents.itemUse.subscribe(ev => {
    for (let data of classIdList) {
        let rawData = classData[`${data}`]
        if (rawData.useItem === ev.itemStack.typeId) {
            if (rawData.isOni && ev.source.hasTag("oni")) {
                ev.source.addTag(data)
                server.world.getDimension("overworld").runCommand(`${rawData.runCommand}`)
                ev.source.removeTag(data)
            }
            else if (!rawData.isOni && ev.source.hasTag("nige")) {
                ev.source.addTag(data)
                server.world.getDimension("overworld").runCommand(`${rawData.runCommand}`)
                ev.source.removeTag(data)
            }
        }
    }
})

server.system.afterEvents.scriptEventReceive.subscribe(ev => {
    debugMode && server.world.sendMessage(`受信イベント: ${ev.id}`);
});

//開始の合図
server.system.afterEvents.scriptEventReceive.subscribe(ev => {
    if (ev.id == "playtag:start"){
        debugMode && server.world.sendMessage("start実行")
        if (!nowPlaying || !nowLoading) {
            const maxTime = timeGlobal //ここで最大秒数を指定
            const players = server.world.getPlayers();
            if (players.length === 0) {
                server.world.sendMessage("プレイヤーがいません");
                return;
            }

            if (players.length === 1) {
                if (debugMode) {
                    let oni = players[0];
                    oni.addTag("oni");
                    oniGlobal = oni.name;
                    server.world.sendMessage("1人用テストモード: あなたが鬼です");
                    nowPlaying = true;
                    server.world.sendMessage("nowPlaying=true")
                    start(oni, maxTime);
                    return;
                } else {
                    server.world.sendMessage("プレイヤーが一人しかいません")
                    return;
                }
            }

            const randomIndex = Math.floor(Math.random() * players.length); //ちゃんと0から開始されます
            let oni = players[randomIndex]
            oni.addTag("oni")
            const oniClassRandomIndexNige = Math.floor(Math.random() * classIdNige.length)
            const oniRawDataNige = classData[`${classIdNige[oniClassRandomIndexNige]}`]
            server.world.getDimension("overworld").runCommand(`give ${oni.name} ${oniRawDataNige.useItem} ${oniRawDataNige.count}`)
            const oniClassRandomIndexOni = Math.floor(Math.random() * classIdOni.length)
            const oniRawDataOni = classData[`${classIdOni[oniClassRandomIndexOni]}`]
            server.world.getDimension("overworld").runCommand(`give ${oni.name} ${oniRawDataOni.useItem} ${oniRawDataOni.count}`)
            oni.sendMessage(`あなたの鬼側の職業は${oniRawDataOni.name}です`)
            oni.sendMessage(`あなたの逃走者側の職業は${oniRawDataNige.name}です`)
            oniGlobal = oni.name
            let niges = []
            debugMode && server.world.sendMessage("鬼が決められた")
            for (let i = 0; i < players.length; i++) {
                if (i === randomIndex) continue;
                players[i].addTag("nige");
                const classRandomIndexNige = Math.floor(Math.random() * classIdNige.length)
                const rawDataNige = classData[`${classIdNige[classRandomIndexNige]}`]
                server.world.getDimension("overworld").runCommand(`give ${players[i].name} ${rawDataNige.useItem} ${rawDataNige.count}`)
                const classRandomIndexOni = Math.floor(Math.random() * classIdOni.length)
                const rawDataOni = classData[`${classIdOni[classRandomIndexOni]}`]
                server.world.getDimension("overworld").runCommand(`give ${players[i].name} ${rawDataOni.useItem} ${rawDataOni.count}`)
                players[i].sendMessage(`あなたの逃走者側の職業は${rawDataNige.name}です`)
                players[i].sendMessage(`あなたの鬼側の職業は${rawDataOni.name}です`)
                players[i].addEffect("weakness", 20 * timeGlobal, {amplifier : 255})
                niges.push(players[i])
                debugMode && server.world.sendMessage(`player「${players[i]}」が逃げる側になった`)
            };
            nowPlaying = true
            start(oni, maxTime);
        }
    }
})

//リセットしたいとき用
server.system.afterEvents.scriptEventReceive.subscribe(ev => {
    if (ev.id == "playtag:reset"){
        debugMode && server.world.sendMessage("resetイベント受信");
        if (nowPlaying) {
            reset();
        } else {
            server.world.sendMessage("Error: nowPlaying is false");
        }
    }

})

//鬼交代時のシステム
server.world.afterEvents.entityHitEntity.subscribe((event) => {
    if (nowPlaying && !waiting) {
        const attacker = event.damagingEntity;
        const victim = event.hitEntity;

        // 鬼が逃げ役を殴った場合
        if (
            attacker instanceof Player &&
            attacker.hasTag("oni") &&
            victim instanceof Player &&
            victim.hasTag("nige")
        ) {
        // タグ入れ替えによる鬼交代
        attacker.removeTag("oni");
        debugMode && server.world.sendMessage("oni: 鬼タグ削除")
        attacker.addTag("nige");
        debugMode && server.world.sendMessage("oni: 逃げタグ追加")
        attacker.removeEffect("speed")
        attacker.addEffect("weakness", timeGlobal * 20, { amplifier: 255})

        victim.removeTag("nige");
        debugMode && server.world.sendMessage("nige: 逃げタグ削除")
        victim.addTag("oni");
        debugMode && server.world.sendMessage("nige: 鬼タグ追加")
        oniGlobal = victim.name
        server.world.sendMessage(`${victim.name} が新たな鬼になった！`);
        victim.removeEffect("weakness")
        victim.addEffect("slowness", 60, { amplifier: 255 })
        victim.addEffect("weakness", 100, { amplifier: 255 })
        victim.addEffect("speed", timeGlobal * 20, {amplifier: 1})
        waitNextOni()
        }
    }
});

//設定コマンド
server.system.afterEvents.scriptEventReceive.subscribe(ev => {
    if (ev.id == "playtag:config") {
        let args = ev.message.split(" ");
        debugMode && server.world.sendMessage("config")
        if (args[0] == "debugmode") {
            if (args.length == 1) {
                let message = `現在のデバッグモードは${debugMode}です`
                messageWithCustomCommand(ev, message)
            }
            else if (args.length == 2) {
                if (args[1] == "true") {
                    debugMode = true
                    const message = "デバッグモードをtrueに更新しました"
                    messageWithCustomCommand(ev, message) 
                }  
                else if (args[1] == "false") {
                    debugMode = false
                    const message = "デバッグモードをfalseに更新しました"
                    messageWithCustomCommand(ev, message)
                    }
                else {
                    let message = "構文エラー"
                    messageWithCustomCommand(ev, message)
                }
            }else {
                let message = "構文エラー"
                messageWithCustomCommand(ev, message)
            }
        }
        else if (args[0] == "maxtime") {
            if (args.length == 1) {
                let message = `現在の設定されている時間は${timeGlobal}秒です`
                messageWithCustomCommand(ev, message)
            }
            else if (args.length == 2) {
                let num
                try {
                num = parseInt(args[1], 10);
                }
                catch(error) {
                    let message = error.message
                    messageWithCustomCommand(ev, message)
                    return;
                }
                timeGlobal = num
                const message = `時間を${timeGlobal}秒に設定しました`
                messageWithCustomCommand(ev, message)
            }
            else {
                let message = "構文エラー"
                messageWithCustomCommand(ev, message)
            }
        }
        else if (args[0] == "lobby") {
            if (args.length == 1) {
                const message = `現在のロビー座標は${lobbyData}です`
                messageWithCustomCommand(ev, message)
                }
            else if (args.length == 4) {
                lobbyData = [parseFloat(args[1]), parseFloat(args[2]), parseFloat(args[3])]
                let message = `ロビー座標を${lobbyData}に設定しました`
                messageWithCustomCommand(ev, message)
            }
            else {
                let message = "構文エラー"
                messageWithCustomCommand(ev, message)
            }
        }
        else if (args[0] == "stage") {
            if (args.length == 1) {
                const message = `現在のステージ座標は${stageData}です`
                messageWithCustomCommand(ev, message)
            }
            else if (args.length == 4) {
                stageData = [parseFloat(args[1]), parseFloat(args[2]), parseFloat(args[3])]
                let message = `ステージ座標を${stageData}に設定しました`
                messageWithCustomCommand(ev, message)
            }
            else {
                let message = "構文エラー"
                messageWithCustomCommand(ev, message)
            }
        }
        else {
            let message = "現在存在するconfigが以下の通りです\n[debugmode, maxtime, lobby. stage]"
            messageWithCustomCommand(ev, message)
        }
    }
})

//どうしようもないセットアップ ほんとうにどうしよ
server.system.afterEvents.scriptEventReceive.subscribe(ev => {
    if (ev.id == "playtag:setup"){
        server.world.getDimension("overworld").runCommand("tag @a remove oni");
        server.world.scoreboard.getObjective("data") 
        ?? server.world.scoreboard.addObjective("data", "dummy");
        server.world.scoreboard.getParticipants().find(p => p.displayName === "max_oni")
        ??server.world.scoreboard.addIdentity("max_oni");
        server.world.scoreboard.getParticipants().find(p => p.displayName === "max_time")
        ??server.world.scoreboard.addIdentity("max_time");
        server.world.sendMessage("setupが実行されました");
    }
})

let introIntervalId = null;

//開始時のやつ
function start(oni, maxTime) {
    server.world.getDimension("overworld").runCommand(`tp @a[tag=nige] ${stageData[0]} ${stageData[1]} ${stageData[2]}`)
    oni.addEffect("speed", timeGlobal * 20, { amplifier:0 })
    nowLoading = true //読み込んでいるかを検知する用
    server.world.sendMessage(`最初の鬼は ${oni.name} さんです`);
    let count = 0;
    let list = ["3","2","1","スタート"] //この配列の通りにtitleが流れる

    introIntervalId = server.system.runInterval(() => { //setIntervalはScriptAPiにない
        count++;
        debugMode && server.world.sendMessage(`count: ${count}`); // デバッグ用
        server.world.getDimension("overworld").runCommand(`title @a title ${list[count - 1]}`) //「getDimension」が重要


        if (count >= 4) {
            server.system.clearRun(introIntervalId); //clearRunでいいらしい
            server.world.sendMessage("スタート！");
            nowLoading = false
            server.world.getDimension("overworld").runCommand(`tp @a[tag=oni] ${stageData[0]} ${stageData[1]} ${stageData[2]}`)
            loop(maxTime, onTick, onComplete);
        }
    }, 20); // 20tick = 1秒
}

//リセット処理
function reset() {
    if (nowLoading) { //読み込み中なら無視
        server.world.sendMessage("読み込み中にリセットは行えません")
        return;
    }
    nowPlaying = false;
    debugMode && server.world.sendMessage("nowPlayingがfalseに")
    if (loopId1 != null) {
        server.system.clearRun(loopId1);
        loopId1 = null;
    }
    debugMode && server.world.sendMessage("loopId1 is null...")
    const players = server.world.getPlayers();
    const oniPlayers = players.filter(p => p.hasTag("oni")); //プレイヤーの中から鬼だけ検知
    if (oniPlayers.length > 0) {
        server.world.sendMessage(`最後の鬼は ${oniPlayers[0].name} でした！`);
    } else {
        server.world.sendMessage("鬼はいませんでした..."); //ChatGPT「なんか追加しときました」
    }
    for (let i = 0; i < players.length; i++) {
        try { //try-catchでエラー無視(つまり全プレイヤーからoniとnigeを削除)
        players[i].removeTag("oni")
        players[i].removeTag("nige")
        players[i].removeEffect("speed")
        players[i].removeEffect("weakness");
        players[i].removeEffect("slowness")
        
        } catch (e) {
            console.log("エラーを確認")
        }
    }
    server.world.getDimension("overworld").runCommand(`tp @a ${lobbyData[0]} ${lobbyData[1]} ${lobbyData[2]}`)
    server.world.getDimension("overworld").runCommand("clear @a")

}

//ループ処理
function loop(seconds, onTick, onComplete) {
    if (loopId1 !== null) {
        server.system.clearRun(loopId1); // 前のループを止める
    }

    let remaining = seconds; // 秒数

    loopId1 = server.system.runInterval(() => {
        if (remaining <= 0) { //ゲーム終了処理
            server.system.clearRun(loopId1);
            loopId1 = null
            server.world.getDimension("overworld").runCommand("title @a title \"ゲーム終了\"");
            reset();
            return;
        }
        if (onTick) onTick(remaining);
        remaining--;
    }, 20); // 20 ticks = 1秒
}


//毎秒行われる処理
function onTick(remaining) {
    server.world.getDimension("overworld").runCommand(`title @a actionbar \"残り: ${remaining}秒\/現在の鬼: ${oniGlobal}"`);
}

//ゲーム終了時の処理(廃棄済)
function onComplete() {
    server.world.getDimension("overworld").runCommand("title @a title \"ゲーム終了\"");
    reset();
}

//鬼交代時のクールタイム
function waitNextOni() {
    waiting = true
    if (waitNextOniLoop !== null) {
        server.system.clearRun(waitNextOniLoop);
    }

    let waitingTime = 0
    waitNextOniLoop = server.system.runInterval(() => {
        waitingTime++;
        if (waitingTime >= 5) {
            server.system.clearRun(waitNextOniLoop);
            waiting = false
        }
    }, 20)
    
}

function messageWithCustomCommand(ev, message) { //カスタムコマンドでのメッセージ送信
    if(ev.sourceType == "Entity"){
        ev.sourceEntity.sendMessage(message);
    }
    else if(ev.sourceType == "Block"){
        ev.sourceBlock.dimension.getPlayers().forEach(player => player.sendMessage(message));
    }
    else if(ev.sourceType == "Server"){
        console.log(message)
}}

//職業選択画面
function show_form(player){
    const form = new ui.ActionFormData()
    form.title("職業を選択してください")
    form.button("テスト1")
    form.button("テスト2");
    form.show(player).then((response) => {
        switch(response.selection){
            case 0:
                player.sendMessage("テスト1を選択");
                break;
            case 1:
                player.sendMessage("テスト2を選択");
                break;
            default:
                player.sendMessage("何も選択していません。");
                break;
        }
    }).catch(error =>
        player.sendMessage("An error occurred: " + error.message)
    );
}

//選択画面表示
//server.world.afterEvents.itemUse.subscribe(ev => {
//    if (ev.itemStack.typeId == "minecraft:stick"){
//        debugMode && server.world.sendMessage("stick was used")
//        let player = ev.source;
//        show_form(player);
//    }
//});

