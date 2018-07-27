//引用基本库
// 通讯模块
const Fetch = require('node-fetch');
// body参数组合模块
const QueryString = require('query-string');
// 加密模块
const Crypto = require('crypto');
// fs
const FS = require("fs");

//基本配置
let ConfigData = {
    //API密钥
    'AccessKey': '',
    'SecretKey': '',
    //交易币名称
    'marketName': 'eth_usdt',
    //中间等待时间间隔
    // 单位：毫秒
    'waitTime': 5000,
    //交易货币保留小数点 位数
    'fixNumber': 2,
    //交易个数
    // 如eth_usdt，则指eth个数
    'transactionsNumber': 0.5,
    //交易等待成功，最长时间
    // 单位：毫秒
    // 默认20秒
    'waitFinishTime': 20000,
    //是否显示底层操作日志？
    // 但会记录到日志文件内
    'showCoreLog': false,
    //警戒比例
    // 账户初始余额偏离该百分比后，将自动判定为失败
    // 例如：
    //      eth余额最初为100，经过几次脚本循环后变为111或89，则自动退出脚本
    'forceStopP': 0.1,
    //自动撤销订单时间
    // 单位：毫秒
    'autoClearOrderTime': 3000
};

//读取配置文件
try{
    let configDataC = FS.readFileSync('./config-data.json');
    ConfigData = JSON.parse(configDataC);
    console.log('配置加载成功..');
}catch(err){
    console.log(err.toString());
    return;
}

/**
 *
 * 将日期时间转为Unix时间戳
 * @param date Date 时间
 * @param format 格式 eg : yyyy-MM-dd hh:mm
 * @returns string 新的时间格式
 * @constructor
 */
let GetDateToFormat = function(date,format){
    let o = {
        "M+": date.getMonth() + 1,                 //月份
        "d+": date.getDate(),                    //日
        "h+": date.getHours(),                   //小时
        "m+": date.getMinutes(),                 //分
        "s+": date.getSeconds(),                 //秒
        "q+": Math.floor((date.getMonth() + 3) / 3), //季度
        "S": date.getMilliseconds()             //毫秒
    };
    if (/(y+)/.test(format))
        format = format.replace(RegExp.$1, (date.getFullYear() + "").substr(4 - RegExp.$1.length));
    for (let k in o)
        if (new RegExp("(" + k + ")").test(format))
            format = format.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
    return format;
};

/**
 * 发送日志
 *  同时将保存到文件
 * @param message 消息
 * @param isCore 是否核心日志，默认不是
 * @constructor
 */
let SendLog = function(message,isCore){
    let nowDate = new Date();
    let LogFileSrc = './log/log-' + GetDateToFormat(nowDate,'yyyy_MM_dd_hh') + '.log';
    let LogCoreFileSrc = './log/core-' + GetDateToFormat(nowDate,'yyyy_MM_dd_hh') + '.log';
    let nowTime = new Date().toLocaleString();
    let logMessage = '[' + nowTime + '] ';
    if(isCore){
        logMessage += '[Core] ';
    }
    logMessage = logMessage + message;
    if(ConfigData.showCoreLog){
        console.log(logMessage);
    }else{
        if(!isCore){
            console.log(logMessage);
        }
    }
    let src = LogFileSrc;
    if(isCore){
        src = LogCoreFileSrc;
    }
    FS.appendFile(src,logMessage + '\r\n', function(err){
        if(err){
            console.log(err.toString());
        }
    });
};

/**
 * 修改总记录的累计数量
 * 叠加数据
 * @param totalNum 执行次数
 * @param totalBuy 总买入金额
 * @param buyUnit 买入次数
 * @param totalSell 总卖出金额
 * @param sellUnit 卖出次数
 * @constructor
 */
let SaveTotalConfig = function(totalNum,totalBuy,buyUnit,totalSell,sellUnit){
    //打开文件并解析
    let src = './config.json';
    let data;
    try{
        data = FS.readFileSync(src);
    }catch(err){
        console.log(err.toString());
    }
    let dataArr = {};
    if(data){
        try{
            dataArr = JSON.parse(data);
        }catch(err){
            console.log(err.toString());
        }
    }
    if(!dataArr[ConfigData.marketName]){
        dataArr[ConfigData.marketName] = {};
    }
    dataArr[ConfigData.marketName]['totalNum'] = Math.abs(dataArr[ConfigData.marketName]['totalNum']) + Math.abs(totalNum);
    dataArr[ConfigData.marketName]['totalBuy'] = (Math.abs(dataArr[ConfigData.marketName]['totalBuy']) + Math.abs(totalBuy) * Math.abs(buyUnit)).toFixed(4);
    dataArr[ConfigData.marketName]['buyUnit'] = Math.abs(dataArr[ConfigData.marketName]['buyUnit']) + Math.abs(buyUnit);
    dataArr[ConfigData.marketName]['totalSell'] = (Math.abs(dataArr[ConfigData.marketName]['totalSell']) + Math.abs(totalSell) * Math.abs(sellUnit)).toFixed(4);
    dataArr[ConfigData.marketName]['sellUnit'] = Math.abs(dataArr[ConfigData.marketName]['sellUnit']) + Math.abs(sellUnit);
    //重新编译存储
    try{
        FS.writeFileSync(src,JSON.stringify(dataArr),{
            flag: 'w+',
        });
    }catch(err){
        console.log(err.toString());
    }
    //输出日志
    console.log('<< 本程序累计完成');
    for(let key in dataArr){
        let val = dataArr[key];
        console.log('       交易对' + ConfigData.marketName + ': ' + val['totalNum'] + '次循环, 买入金额: ' + val['totalBuy'] + ', 买入单位: ' + val['buyUnit'] + ', 卖出金额: ' + val['totalSell'] + ', 卖出单位: ' + val['sellUnit']);
    }
    console.log('       全部累计提示结束 >>');
};

/**
 * 通讯基础模块
 * 自动合并构建前置参数，并post提交数据
 * @param {*} postType 请求方式post/get
 * @param {*} url URL
 * @param {*} params 请求参数
 * @param {*} paramType 参数类型，formdata / json
 */
let PostData = async function(postType,url,params,paramType){
    //生成sign连接密钥
    let timestamp = await Date.parse(new Date());
    //组合init
    let init = {
        method: postType,
        headers: {
            'Timestamp': timestamp,
            'Apiid': ConfigData.AccessKey,
        },
    };
    //如果存在参数
    if(params){
        switch(paramType){
            case 'formdata':
                init.headers.Accept = 'application/json, application/xml, text/plain, text/html, *.*';
                init.headers['Content-Type'] = 'application/json; charset=utf-8';
                init.body = QueryString.stringify(params);
            break;
            case 'json':
                init.headers.Accept = 'application/json';
                init.headers['Content-Type'] = 'application/json; charset=utf-8';
                init.body = JSON.stringify(params);
            break;
            default:
                SendLog('参数类别错误，无法发送数据。');
                return;
        }
        if(paramType === 'formdata'){
            let sign = ConfigData.AccessKey + timestamp.toString();
            for(let key in params){
                let val = params[key];
                sign = sign + key + val;
            }
            sign = sign + ConfigData.SecretKey;
            //SendLog('sign : ' + sign);
            try{
                let CryptoMD5 = await Crypto.createHash('md5');
                init.headers.Sign = await CryptoMD5.update(sign.toString()).digest('hex');
            }catch(err){
                SendLog(err.toString());
                return;
            }
        }
        if(paramType === 'json'){
            let sign = ConfigData.AccessKey + timestamp.toString();
            sign = await sign + JSON.stringify(params);
            sign = sign + ConfigData.SecretKey;
            //SendLog('sign : ' + sign);
            try{
                let CryptoMD5 = await Crypto.createHash('md5');
                init.headers.Sign = await CryptoMD5.update(sign.toString()).digest('hex');
            }catch(err){
                SendLog(err.toString());
                return;
            }
        }
    }else{
        //无参数直接提交
        let CryptoMD5 = await Crypto.createHash('md5');
        init.headers.Sign = await CryptoMD5.update(ConfigData.AccessKey + ConfigData.SecretKey).digest('hex');
    }
    //日志
    SendLog('向url : ' + url + ', 发送数据 : ' + JSON.stringify(init),true);
    //通讯
    return await Fetch(url,init).then(res => {
        return res.json();
    });
};

/**
 * 获取数据无签名
 * @param url
 * @returns {PromiseLike<T> | Promise<T>}
 * @constructor
 */
let GetDataNoSign = async function(url){
    //组合init
    let init = {
        method: 'get',
    };
    //日志
    await SendLog(' ~ 发送数据，body : ' + JSON.stringify(init),true);
    //通讯
    return await Fetch(url,init).then(res =>{
        try{
            return res.json();
        }catch(err){
            SendLog('异常，API返回的数据无法解析，' + err.toString());
        }
    });
};

//用户资金数据
let UserFundData = {};

/**
 * 获取用户资金数据
 *  完成后，调用UserFundData即可查询数据
 * @returns {Promise<*>}
 * @constructor
 */
let GetUserFund = async function(){
    //尝试获取用户个人交易数据，测试是否正常？
    return await PostData('post','https://api.zbg.com/exchange/fund/controller/website/fundcontroller/findbypage',{
        "pageSize":200,
        "pageNum":1
    },'json').then(res => {
        SendLog('服务器已经反馈数据，正在分析...');
        if(res['resMsg']['code'] > 0){
            UserFundData = res['datas'];
            SendLog('用户资产数据获取成功.');
            return true;
        }
        SendLog('用户资产数据获取失败.');
        return false;
    });
};

/**
 * 测试模块
 * 成功后testOK为true
 * @type {boolean}
 */
let testOK = false;
let TestMode = async function(){
    let testPersonnelData = await async function(){
        await SendLog('开始测试用户连接...');
        //尝试获取用户个人交易数据，测试是否正常？
        await PostData('post','https://api.zbg.com/exchange/fund/controller/website/fundcontroller/findbypage',{
            "pageSize":30,
            "pageNum":1
        },'json').then(res => {
            SendLog('服务器已经反馈数据，正在分析...');
            if(res['resMsg']['code'] > 0){
                testOK = true;
                SendLog('用户资产数据获取成功，测试通过.');
                return
            }
            SendLog('用户资产数据获取失败，测试未通过.');
        });
    };
    //尝试获取行情数据，测试是否正常？
    await SendLog('开始测试行情数据连接...');
    await GetDataNoSign('https://kline.zbg.com/api/data/v1/tickers?isUseMarketName=false').then(res => {
        SendLog('服务器已经反馈数据，正在分析...');
        if(res['resMsg']['code'] > 0){
            testPersonnelData();
            SendLog('行情获取成功，测试通过.');
            return
        }
        SendLog('行情获取失败，测试未通过.');
    });
};

//市场数据集合
let MarketList;
//当前要操作的市场
let MarketNow;
//当前操作的市场价格信息
let MarketNowPrice;
//中间价格
let buyAndSellMedian = 0;

/**
 * 获取市场及市场行情
 *  完成后MarketList为存在数据的数组结构
 * @returns {Promise<boolean>}
 * @constructor
 */
let GetMarket = async function(){
    //获取市场列表
    await GetDataNoSign('https://api.zbg.com/exchange/config/controller/website/marketcontroller/getByWebId').then(res => {
        if(res['resMsg']['code'] > 0){
            MarketList = res['datas'];
            SendLog('市场列表数据获取成功.');
        }
    });
    //检查用户设置的市场，所属ID、状态信息
    for(let key in MarketList){
        let val = MarketList[key];
        if(val['name'] === ConfigData.marketName){
            MarketNow = val;
        }
    }
    if(await MarketNow){
        //console.log(MarketNow);
        SendLog('找到' + MarketNow['name'] + ', 所属ID: ' + MarketNow['marketId'] + ', 状态: ' + MarketNow['state'] + ', 最小数量: ' + MarketNow['minAmount'] + ', 价格精度: ' + MarketNow['priceDecimal']);
    }else{
        SendLog('找不到市场数据，请检查市场名称是否正确？');
        return false;
    }
    if(await MarketNow['state'] < 1){
        SendLog('市场已经关闭，无法交易。');
        return false;
    }
    //获取行情数据
    MarketNowPrice = {};
    await GetDataNoSign('https://kline.zbg.com/api/data/v1/ticker?marketName=' + ConfigData.marketName).then(res => {
        if(res['resMsg']['code'] < 1){
            SendLog('无法获取行情数据，请检查API或网络。');
            return false
        }
        SendLog('行情' + ConfigData.marketName + '获取成功.');
        MarketNowPrice = res['datas'];
    });
    if(!MarketNowPrice){
        return false;
    }
    //取买卖1位置的中间值
    buyAndSellMedian = (Math.abs(MarketNowPrice[7]) + Math.abs(MarketNowPrice[8])) / 2;
    buyAndSellMedian = buyAndSellMedian.toFixed(ConfigData.fixNumber);
    SendLog(ConfigData.marketName + '的理想交易价格为:' + buyAndSellMedian);
    return true;
};

/**
 * 进行一次交易
 * @param entrustType 委托类别 0卖出 1买入
 * @param price 执行价格
 * @returns {Promise<boolean>}
 * @constructor
 */
let BuyOrSell = async function(entrustType,price){
    let buyOK = false;
    await PostData('post','https://api.zbg.com/exchange/entrust/controller/website/EntrustController/addEntrust',{
        "amount": ConfigData.transactionsNumber,
        "rangeType": 0,
        "type": entrustType,
        "marketId": MarketNow['marketId'],
        "price": price
    },'json').then(res => {
        if(!res || res['resMsg']['code'] < 1){
            SendLog('交易失败，请检查网络状况！退出程序。');
            return false;
        }
        if(!res['datas']){
            SendLog('执行交易失败，可能是API密钥错误、或网络存在故障.');
            return false;
        }
        buyOK = true;
        SendLog('按照' + buyAndSellMedian + '价格' + (entrustType === 0 ? '卖出' : '买入') + ConfigData.marketName + ', 操作数量: ' + ConfigData.transactionsNumber);
        nowEntrustList.push(res['datas']['entrustId']);
    });
    return buyOK;
};

//最初的账户余额
let firstUserFund = -1;
//极限值
let limitMin = 0;
let limitMax = 0;

/**
 * 清理所有委托
 *  获取委托列表，并撤销所有委托
 * @returns {Promise<boolean>}
 * @constructor
 */
let ClearAllEntrust = async function(){
    //从UserFundData['list']中，根据webid找到交易对
    let fundIsOk = false;
    let thisFund = 0;
    //console.log(UserFundData['list']);
    //console.log(MarketNow);
    for(let key in UserFundData['list']){
        let val = UserFundData['list'][key];
        if(val['webId'] === MarketNow['webId']){
            //如果第一次执行，则跳过
            if(firstUserFund < 0){
                firstUserFund = Math.abs(val['amount']);
                limitMin = (firstUserFund * (1 - ConfigData.forceStopP));
                limitMax = (firstUserFund * ConfigData.forceStopP) + firstUserFund;
                fundIsOk = true;
                break;
            }
            //存在的交易对数余额，如果警戒线，则自动退出脚本
            thisFund = Math.abs(val['amount']);
            if(thisFund < limitMin || thisFund > limitMax){
                fundIsOk = false;
            }else{
                //余额正常
                fundIsOk = true;
            }
        }
    }
    if(fundIsOk){
        //SendLog('检查正常，该交易对的账户当前余额' + thisFund + '，不低于' + limitMin + ', 不高于' + limitMax + '，该账户最初额度为' + firstUserFund + '。');
        //return true;
    }else{
        //SendLog('异常，该交易对的账户余额' + thisFund + '，低于' + limitMin + ', 或高于' + limitMax + ', 超出该警戒区间，该账户最初额度为' + firstUserFund + '。说明部分交易失败，导致额度失衡，请进入账户手动清理。');
        //return false;
    }
    //获取当前委托
    let nowEntrustList;
    let isOK = false;
    await PostData('get','https://api.zbg.com/exchange/entrust/controller/website/EntrustController/getUserEntrustRecordFromCache?marketId=' + MarketNow['marketId'],false,'json').then(res => {
        //console.log(res);
        if(!res || res['resMsg']['code'] < 1){
            SendLog('无法获取委托信息');
            return false;
        }
        isOK = true;
        nowEntrustList = res['datas'];
    });
    if(!isOK){
        return false;
    }
    //SendLog(nowEntrustList);
    //发现委托后取消所有委托
    if(!nowEntrustList){
        SendLog('没有发现残留委托，继续进行脚本...');
        return true;
    }
    for(let key in nowEntrustList){
        let val = nowEntrustList[key];
        if(!val || !val['entrustId']){
            await SendLog('异常的委托信息!! 请检查您的委托信息，手动操作修改.');
            continue;
        }
        isOK = false;
        await PostData('post','https://api.zbg.com/exchange/entrust/controller/website/EntrustController/cancelEntrust',{
            'entrustId' : val['entrustId'],
            'marketId' : MarketNow['marketId']
        },'json').then(res => {
            //console.log(res);
            if(!res || res['resMsg']['code'] < 1){
                SendLog('无法撤销委托订单，请检查网络环境或API是否正常...');
                return false;
            }
            isOK = true;
        });
        if(!isOK){
            SendLog('无法撤销订单，请手动操作...订单ID: ' + val['entrustId']);
            return false;
        }
    }
    return true;
};

//交易是否成功
let waitFinishTime = 0;
//当前正在执行的订单列队
let nowEntrustList = [];
//确保正在执行1个
let nowEntrustLock = false;
//记录循环次数
let runNumber = 0;
//累计交易金额
let runBuyTotal = 0;
let runSellTotal = 0;

/**
 * 检查交易是否成功
 *  将检查nowEntrustList列队所有订单完成状态
 *  全部完成后将调用下一次任务
 * @returns {Promise<boolean>}
 * @constructor
 */
let CheckFinish = async function(){
    //考虑到无法使用API，直接跳过该不步骤
    nowEntrustList = [];
    //检查状态
    if(nowEntrustLock) {
        return false;
    }
    //修改状态
    nowEntrustLock = true;
    //超时判断
    if(waitFinishTime < 1){
        SendLog('订单执行失败，超出等待时间，退出脚本.');
        return false;
    }
    //检查订单是否完成？
    for(let key in nowEntrustList){
        let val = nowEntrustList[key];
        if(!val){
            continue;
        }
        await PostData('post','https://api.zbg.com/exchange/entrust/controller/website/EntrustController/getEntrustById',{
            'entrustId' : val,
            'marketId' : MarketNow['marketId'],
        },'json').then(res => {
            if(!res || res['resMsg']['code'] < 1){
                SendLog('无法根据ID获取订单信息，请检查网络环境或API是否正常...');
                SendLog(res);
                return false;
            }
            if(res['resMsg']['code'] === '6096'){
                SendLog('订单' + val + '已经完成.');
                //清理掉该订单
                nowEntrustList[key] = '';
            }
            //SendLog(res);
        });
    }
    //重组清单
    let newNowEntrustList = [];
    for(let key in nowEntrustList){
        if(!nowEntrustList[key]){
            continue;
        }
        newNowEntrustList.push(nowEntrustList[key]);
    }
    nowEntrustList = newNowEntrustList;
    //时间递减
    waitFinishTime = waitFinishTime - 1;
    //解除锁定
    nowEntrustLock = false;
    //如果存在值，则继续
    if(nowEntrustList.length > 0){
        setTimeout(CheckFinish,1000);
    }else{
        runNumber += 1;
        runBuyTotal = runBuyTotal + (buyAndSellMedian * ConfigData.transactionsNumber);
        runSellTotal = runSellTotal + (buyAndSellMedian * ConfigData.transactionsNumber);
        SaveTotalConfig(1,buyAndSellMedian,ConfigData.transactionsNumber,buyAndSellMedian,ConfigData.transactionsNumber);
        SendLog('执行完成第' + runNumber + '次，本次脚本执行, 累计买入金额' + (runBuyTotal) + ', 累计卖出金额' + (runSellTotal) + ', ' + '，等待:' + ConfigData.waitTime + '毫秒后继续执行下一轮...');
        console.log('#############################################################################################################################');
        //如果发现runBuyTotal与runSellTotal不同，则退出脚本
        if(runBuyTotal !== runSellTotal){
            SendLog('异常状况，买入总额: ' + runBuyTotal + ', 卖出总额: ' + runSellTotal + ', 存在差值，可能是标的物波动较大引起交易失败，请检查挂单并撤销。');
            return false;
        }
        //等待N秒后继续
        setTimeout(Run,ConfigData.waitTime);
    }
    return true;
};

/**
 * 撤销指定订单
 * @param entrustId 订单ID
 * @returns {Promise<*>}
 * @constructor
 */
let ClearEntrust = async function(entrustId){
    return await PostData('post','https://api.zbg.com/exchange/entrust/controller/website/EntrustController/cancelEntrust',{
        'entrustId' : entrustId,
        'marketId' : MarketNow['marketId']
    },'json').then(res => {
        if(!res || res['resMsg']['code'] < 1){
            SendLog('无法撤销订单，请检查网络环境或API是否正常, 请手动操作...订单ID: ' + entrustId);
            return false;
        }
        //console.log(res);
        //SendLog('尝试撤销订单，订单ID: ' + entrustId);
        return true;
    });
};

//执行脚本主体部分
let Run = function(){
    //获取市场数据
    buyAndSellMedian = [];
    const promise = new Promise((resolve, reject) =>{
        //间隔500毫秒执行1次动作
        setTimeout(() => {
            resolve(true);
        },500);
    });
    promise.then(res =>{
        return GetMarket();
    }).then(res => {
        if (!res) {
            return false;
        }
        //考虑到无法使用API，直接跳过该不步骤
        return true;
        //获取用户资金数据
        return GetUserFund();
    }).then(res => {
        if (!res) {
            return false;
        }
        //考虑到无法使用API，直接跳过该不步骤
        return true;
        //清理当前委托
        return ClearAllEntrust();
    }).then(res => {
        if(!res){
            return false;
        }
        //按照价格买入
        return BuyOrSell(1,buyAndSellMedian);
    }).then(res => {
        if(!res){
            return false;
        }
        //按照价格卖出
        return BuyOrSell(0,buyAndSellMedian);
    }).then(res => {
        if(!res){
            return false;
        }
        //延迟等待后，清理列队所有订单，如果未成交，说明已经失败，不需要继续等待
        const promiseFinish = new Promise((resolveFinish, rejectFinish) =>{
            //间隔500毫秒执行1次动作
            setTimeout(() => {
                resolveFinish(true);
            },ConfigData.autoClearOrderTime);
        });
        promiseFinish.then(res => {
            if(!res){
                return false;
            }
            for(let key in nowEntrustList){
                let val = nowEntrustList[key];
                if(!val){
                    continue;
                }
                if(!ClearEntrust(val)){
                    return false;
                }
                SendLog('尝试等待后，撤销订单，无论成功或失败。该问题主要是官方API，无法查询委托订单，所以只能强制执行撤销。确保N秒后没有遗留订单。');
            }
            return true;
        }).then(res => {
            if(!res){
                return false;
            }
            //执行检查程序
            waitFinishTime = ConfigData.waitFinishTime;
            return CheckFinish();
        });
        return true;
    });
};

//开始执行脚本
SendLog('开始执行脚本...');

//执行测试脚本
TestMode();

//等待测试完成
let testTimer = setInterval(function(){
    if(testOK){
        SendLog('准备开始获取行情数据，当前指定为' + ConfigData.marketName + '，每' + ConfigData.waitTime + '毫秒执行1次操作。');
        Run();
        clearInterval(testTimer);
    }
},500);