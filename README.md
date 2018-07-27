# niu-zbg-api
使用node.js实现，调用官方接口，实现自动化委托交易的脚本。

注意，该脚本run()部分，目标是计算中间价，自动化买入和卖出动作。这是因为ZBG官方最近在搞活动，参与的将给予奖励。评分标准就是手续费高低，所以该将本将按照交易对当前价格，进行同价位买入和卖出操作，以自动实现高手续费，换取奖励。

如果您有其他用途，可以修改Run中买入、卖出部分。

# 修改配置
进入根目录下的config-data.json文件，找到配置信息修改即可。

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

# 方法介绍
参数详细说明，请参考代码注释。这里诺列全部方法，方便您参考和使用。

  GetDateToFormat(date,format) 根据date时间获取特定结构的时间字符串
  SendLog(message,isCore) 发送日志
  SaveTotalConfig(totalNum,totalBuy,buyUnit,totalSell,sellUnit) 保存统计数据
  PostData(postType,url,params,paramType) 发送带私钥的API
  GetDataNoSign(url) 发送没有密钥的API
  GetUserFund() 获取用户资金信息
  TestMode() 测试模块，将自动发送非密钥API、带密钥API，测试通讯是否正常
  GetMarket() 获取市场列表
  BuyOrSell(entrustType,price) 进行一次交易
  ClearEntrust() 清理当前交易对的所有委托（该方法官方API不可用）
  CheckFinish() 检查订单完成情况，执行委托后请调用该方法（该方法部分官方API不可用，只确保输出任务结束信息、统计信息）
  Run() 脚本主体

# 常见问题

## 关于订单问题
由于官方API只开放了新建委托方法，所以脚本暂时只能实现新建委托，而无法查询委托、撤销委托，这必然会导致失败交易下产生大量无用订单。请确保在电脑前，手动撤销多余的订单。

## 关闭调用限制
根据测试和与官方沟通，API调用1s不能超出3次，否则会有被锁定部分USDT的风险。

本脚本修改为每秒2-3次。其中1次是查询市场列表，剩下2次是交易买入和卖出操作。

## 如何自定义执行脚本？
您可以在脚本结尾找到Run()函数，修改里面的执行顺序，就可以实现自动化交易。

# 使用协议
本项目遵守Apache2.0协议。
