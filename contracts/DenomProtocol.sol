// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Like {
    function decimals() external view returns (uint8);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

library SafeToken {
    error TokenTransferFailed();

    function safeTransfer(IERC20Like token, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = address(token).call(
            abi.encodeWithSelector(token.transfer.selector, to, amount)
        );
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TokenTransferFailed();
    }

    function safeTransferFrom(IERC20Like token, address from, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = address(token).call(
            abi.encodeWithSelector(token.transferFrom.selector, from, to, amount)
        );
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TokenTransferFailed();
    }
}

contract DenomToken {
    error OnlyMarket();
    error InsufficientBalance();
    error InsufficientAllowance();
    error InvalidReceiver();

    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    address public immutable market;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);

    constructor(string memory name_, string memory symbol_, address market_) {
        name = name_;
        symbol = symbol_;
        market = market_;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 permitted = allowance[from][msg.sender];
        if (permitted != type(uint256).max) {
            if (permitted < amount) revert InsufficientAllowance();
            unchecked { allowance[from][msg.sender] = permitted - amount; }
        }
        _transfer(from, to, amount);
        return true;
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != market) revert OnlyMarket();
        if (to == address(0)) revert InvalidReceiver();
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function burnFrom(address from, uint256 amount) external {
        if (msg.sender != market) revert OnlyMarket();
        uint256 balance = balanceOf[from];
        if (balance < amount) revert InsufficientBalance();
        unchecked { balanceOf[from] = balance - amount; }
        totalSupply -= amount;
        emit Transfer(from, address(0), amount);
    }

    function _transfer(address from, address to, uint256 amount) internal {
        if (to == address(0)) revert InvalidReceiver();
        uint256 balance = balanceOf[from];
        if (balance < amount) revert InsufficientBalance();
        unchecked { balanceOf[from] = balance - amount; }
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}

contract DenomMarket {
    using SafeToken for IERC20Like;

    error ReentrantCall();
    error InvalidAmount();
    error InvalidTerms();
    error SlippageExceeded();
    error SupplyLimit();
    error OnlyCreator();

    uint256 private constant WAD = 1e18;
    uint16 public constant PLATFORM_FEE_BPS = 100;
    uint16 public constant MAX_CREATOR_FEE_BPS = 500;

    address public immutable factory;
    address public immutable creator;
    address public immutable platformTreasury;
    IERC20Like public immutable quoteToken;
    DenomToken public immutable token;
    uint8 public immutable quoteDecimals;
    uint256 public immutable quoteScale;
    uint256 public immutable initialPrice;
    uint256 public immutable slope;
    uint256 public immutable maxSupply;
    uint16 public immutable creatorFeeBps;
    string public unit;
    string public metadataURI;
    uint256 public reserveBalance;
    uint256 public creatorFees;
    uint256 public volume;
    bool private entered;

    event Trade(
        address indexed trader,
        bool indexed isBuy,
        uint256 quoteAmount,
        uint256 tokenAmount,
        uint256 priceAfter,
        uint256 supplyAfter
    );
    event CreatorFeesClaimed(address indexed creator, uint256 amount);
    event MetadataUpdated(string metadataURI);

    modifier nonReentrant() {
        if (entered) revert ReentrantCall();
        entered = true;
        _;
        entered = false;
    }

    constructor(
        address creator_,
        address treasury_,
        address quoteToken_,
        string memory name_,
        string memory symbol_,
        string memory unit_,
        string memory metadataURI_,
        uint256 initialPrice_,
        uint256 slope_,
        uint256 maxSupply_,
        uint16 creatorFeeBps_
    ) {
        uint8 decimals_ = IERC20Like(quoteToken_).decimals();
        if (
            creator_ == address(0) || treasury_ == address(0) || quoteToken_ == address(0)
                || decimals_ > 18 || initialPrice_ == 0 || initialPrice_ > WAD
                || slope_ == 0 || slope_ > 1e9 || maxSupply_ == 0 || maxSupply_ > 10_000_000_000 * WAD
                || creatorFeeBps_ > MAX_CREATOR_FEE_BPS
        ) revert InvalidTerms();
        factory = msg.sender;
        creator = creator_;
        platformTreasury = treasury_;
        quoteToken = IERC20Like(quoteToken_);
        quoteDecimals = decimals_;
        quoteScale = 10 ** (18 - decimals_);
        initialPrice = initialPrice_;
        slope = slope_;
        maxSupply = maxSupply_;
        creatorFeeBps = creatorFeeBps_;
        unit = unit_;
        metadataURI = metadataURI_;
        token = new DenomToken(name_, symbol_, address(this));
    }

    function currentPrice() public view returns (uint256) {
        return initialPrice + slope * token.totalSupply() / WAD;
    }

    function progressBps() external view returns (uint256) {
        return token.totalSupply() * 10_000 / maxSupply;
    }

    function previewBuy(uint256 quoteIn) public view returns (uint256 tokenOut) {
        if (quoteIn == 0) return 0;
        uint256 fees = quoteIn * (PLATFORM_FEE_BPS + creatorFeeBps) / 10_000;
        uint256 netQuoteWad = (quoteIn - fees) * quoteScale;
        uint256 supply = token.totalSupply();
        uint256 b = 2 * (initialPrice * WAD + slope * supply);
        uint256 discriminant = b * b + 8 * slope * WAD * WAD * netQuoteWad;
        tokenOut = (_sqrt(discriminant) - b) / (2 * slope);
        uint256 available = maxSupply - supply;
        if (tokenOut > available) tokenOut = available;
    }

    function previewSell(uint256 tokenIn) public view returns (uint256 quoteOut) {
        uint256 supply = token.totalSupply();
        if (tokenIn == 0 || tokenIn > supply) return 0;
        uint256 lowSupply = supply - tokenIn;
        uint256 grossWad = initialPrice * tokenIn / WAD
            + slope * (supply * supply - lowSupply * lowSupply) / (2 * WAD * WAD);
        uint256 gross = grossWad / quoteScale;
        uint256 fees = gross * (PLATFORM_FEE_BPS + creatorFeeBps) / 10_000;
        quoteOut = gross - fees;
    }

    function buy(uint256 quoteIn, uint256 minTokensOut) external nonReentrant returns (uint256 tokenOut) {
        if (quoteIn == 0) revert InvalidAmount();
        tokenOut = previewBuy(quoteIn);
        if (tokenOut == 0 || tokenOut < minTokensOut) revert SlippageExceeded();
        if (token.totalSupply() + tokenOut > maxSupply) revert SupplyLimit();
        uint256 platformFee = quoteIn * PLATFORM_FEE_BPS / 10_000;
        uint256 creatorFee = quoteIn * creatorFeeBps / 10_000;
        uint256 net = quoteIn - platformFee - creatorFee;
        quoteToken.safeTransferFrom(msg.sender, address(this), quoteIn);
        if (platformFee != 0) quoteToken.safeTransfer(platformTreasury, platformFee);
        creatorFees += creatorFee;
        reserveBalance += net;
        volume += quoteIn;
        token.mint(msg.sender, tokenOut);
        emit Trade(msg.sender, true, quoteIn, tokenOut, currentPrice(), token.totalSupply());
    }

    function sell(uint256 tokenIn, uint256 minQuoteOut) external nonReentrant returns (uint256 quoteOut) {
        if (tokenIn == 0) revert InvalidAmount();
        uint256 supply = token.totalSupply();
        if (tokenIn > supply) revert InvalidAmount();
        uint256 lowSupply = supply - tokenIn;
        uint256 grossWad = initialPrice * tokenIn / WAD
            + slope * (supply * supply - lowSupply * lowSupply) / (2 * WAD * WAD);
        uint256 gross = grossWad / quoteScale;
        uint256 platformFee = gross * PLATFORM_FEE_BPS / 10_000;
        uint256 creatorFee = gross * creatorFeeBps / 10_000;
        quoteOut = gross - platformFee - creatorFee;
        if (quoteOut == 0 || quoteOut < minQuoteOut || gross > reserveBalance) revert SlippageExceeded();
        token.burnFrom(msg.sender, tokenIn);
        reserveBalance -= gross;
        creatorFees += creatorFee;
        volume += gross;
        if (platformFee != 0) quoteToken.safeTransfer(platformTreasury, platformFee);
        quoteToken.safeTransfer(msg.sender, quoteOut);
        emit Trade(msg.sender, false, gross, tokenIn, currentPrice(), token.totalSupply());
    }

    function claimCreatorFees() external nonReentrant returns (uint256 amount) {
        if (msg.sender != creator) revert OnlyCreator();
        amount = creatorFees;
        if (amount == 0) revert InvalidAmount();
        creatorFees = 0;
        quoteToken.safeTransfer(creator, amount);
        emit CreatorFeesClaimed(creator, amount);
    }

    function updateMetadata(string calldata metadataURI_) external {
        if (msg.sender != creator) revert OnlyCreator();
        metadataURI = metadataURI_;
        emit MetadataUpdated(metadataURI_);
    }

    function _sqrt(uint256 x) private pure returns (uint256 z) {
        if (x == 0) return 0;
        z = 1;
        uint256 y = x;
        if (y >> 128 > 0) { y >>= 128; z <<= 64; }
        if (y >> 64 > 0) { y >>= 64; z <<= 32; }
        if (y >> 32 > 0) { y >>= 32; z <<= 16; }
        if (y >> 16 > 0) { y >>= 16; z <<= 8; }
        if (y >> 8 > 0) { y >>= 8; z <<= 4; }
        if (y >> 4 > 0) { y >>= 4; z <<= 2; }
        if (y >> 2 > 0) z <<= 1;
        for (uint256 i; i < 7; ++i) z = (z + x / z) >> 1;
        uint256 roundedDown = x / z;
        if (roundedDown < z) z = roundedDown;
    }
}

contract DenomQuoteAsset {
    using SafeToken for IERC20Like;

    error ReentrantCall();
    error InvalidTerms();
    error InvalidAmount();
    error SlippageExceeded();
    error InsufficientBalance();
    error InsufficientAllowance();
    error InvalidReceiver();
    error OnlyCreator();

    uint256 private constant WAD = 1e18;
    uint16 public constant EXCHANGE_FEE_BPS = 30;

    string public name;
    string public symbol;
    string public code;
    string public metadataURI;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    uint256 public reserveBalance;
    uint256 public volume;
    uint256 public immutable referencePrice;
    uint256 public immutable baseScale;
    address public immutable creator;
    address public immutable platformTreasury;
    IERC20Like public immutable baseToken;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    bool private entered;

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);
    event Swap(address indexed trader, bool indexed isBuy, uint256 baseAmount, uint256 quoteAmount);
    event MetadataUpdated(string metadataURI);

    modifier nonReentrant() {
        if (entered) revert ReentrantCall();
        entered = true;
        _;
        entered = false;
    }

    constructor(
        address creator_,
        address treasury_,
        address baseToken_,
        string memory name_,
        string memory symbol_,
        string memory code_,
        string memory metadataURI_,
        uint256 referencePrice_
    ) {
        uint8 baseDecimals = IERC20Like(baseToken_).decimals();
        if (
            creator_ == address(0) || treasury_ == address(0) || baseToken_ == address(0)
                || bytes(name_).length == 0 || bytes(symbol_).length == 0 || bytes(code_).length == 0
                || baseDecimals > 18 || referencePrice_ == 0
        ) revert InvalidTerms();
        creator = creator_;
        platformTreasury = treasury_;
        baseToken = IERC20Like(baseToken_);
        baseScale = 10 ** (18 - baseDecimals);
        name = name_;
        symbol = symbol_;
        code = code_;
        metadataURI = metadataURI_;
        referencePrice = referencePrice_;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 permitted = allowance[from][msg.sender];
        if (permitted != type(uint256).max) {
            if (permitted < amount) revert InsufficientAllowance();
            unchecked { allowance[from][msg.sender] = permitted - amount; }
        }
        _transfer(from, to, amount);
        return true;
    }

    function previewBuy(uint256 baseIn) public view returns (uint256 quoteOut) {
        if (baseIn == 0) return 0;
        uint256 fee = baseIn * EXCHANGE_FEE_BPS / 10_000;
        quoteOut = (baseIn - fee) * baseScale * WAD / referencePrice;
    }

    function previewSell(uint256 quoteIn) public view returns (uint256 baseOut) {
        if (quoteIn == 0) return 0;
        uint256 gross = quoteIn * referencePrice / WAD / baseScale;
        baseOut = gross - gross * EXCHANGE_FEE_BPS / 10_000;
    }

    function buy(uint256 baseIn, uint256 minQuoteOut) external nonReentrant returns (uint256 quoteOut) {
        if (baseIn == 0) revert InvalidAmount();
        quoteOut = previewBuy(baseIn);
        if (quoteOut == 0 || quoteOut < minQuoteOut) revert SlippageExceeded();
        uint256 fee = baseIn * EXCHANGE_FEE_BPS / 10_000;
        uint256 net = baseIn - fee;
        baseToken.safeTransferFrom(msg.sender, address(this), baseIn);
        if (fee != 0) baseToken.safeTransfer(platformTreasury, fee);
        reserveBalance += net;
        volume += baseIn;
        totalSupply += quoteOut;
        balanceOf[msg.sender] += quoteOut;
        emit Transfer(address(0), msg.sender, quoteOut);
        emit Swap(msg.sender, true, baseIn, quoteOut);
    }

    function sell(uint256 quoteIn, uint256 minBaseOut) external nonReentrant returns (uint256 baseOut) {
        if (quoteIn == 0 || balanceOf[msg.sender] < quoteIn) revert InvalidAmount();
        uint256 gross = quoteIn * referencePrice / WAD / baseScale;
        baseOut = gross - gross * EXCHANGE_FEE_BPS / 10_000;
        if (baseOut == 0 || baseOut < minBaseOut || gross > reserveBalance) revert SlippageExceeded();
        unchecked { balanceOf[msg.sender] -= quoteIn; }
        totalSupply -= quoteIn;
        reserveBalance -= gross;
        uint256 fee = gross - baseOut;
        if (fee != 0) baseToken.safeTransfer(platformTreasury, fee);
        baseToken.safeTransfer(msg.sender, baseOut);
        volume += gross;
        emit Transfer(msg.sender, address(0), quoteIn);
        emit Swap(msg.sender, false, gross, quoteIn);
    }

    function updateMetadata(string calldata metadataURI_) external {
        if (msg.sender != creator) revert OnlyCreator();
        metadataURI = metadataURI_;
        emit MetadataUpdated(metadataURI_);
    }

    function _transfer(address from, address to, uint256 amount) internal {
        if (to == address(0)) revert InvalidReceiver();
        uint256 balance = balanceOf[from];
        if (balance < amount) revert InsufficientBalance();
        unchecked { balanceOf[from] = balance - amount; }
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}

contract DenomFactory {
    error InvalidTreasury();
    error InvalidBaseToken();
    error InvalidQuoteToken();
    error CodeAlreadyExists();

    address public immutable platformTreasury;
    address public immutable baseQuoteToken;
    address[] public markets;
    address[] public quoteAssets;
    mapping(address => bool) public isMarket;
    mapping(address => bool) public isQuoteAsset;
    mapping(bytes32 => address) public quoteByCode;
    mapping(address => address[]) private creatorMarkets;

    event MarketCreated(
        address indexed market,
        address indexed token,
        address indexed creator,
        address quoteToken,
        string unit,
        string name,
        string symbol,
        string metadataURI
    );

    event QuoteAssetCreated(
        address indexed quoteAsset,
        address indexed creator,
        string code,
        string name,
        string symbol,
        uint256 referencePrice,
        string metadataURI
    );

    constructor(address platformTreasury_, address baseQuoteToken_) {
        if (platformTreasury_ == address(0)) revert InvalidTreasury();
        if (baseQuoteToken_ == address(0)) revert InvalidBaseToken();
        platformTreasury = platformTreasury_;
        baseQuoteToken = baseQuoteToken_;
    }

    function createQuoteAsset(
        string calldata name,
        string calldata symbol,
        string calldata code,
        string calldata metadataURI,
        uint256 referencePrice
    ) external returns (address quoteAssetAddress) {
        bytes32 codeHash = keccak256(bytes(code));
        if (quoteByCode[codeHash] != address(0)) revert CodeAlreadyExists();
        DenomQuoteAsset quoteAsset = new DenomQuoteAsset(
            msg.sender,
            platformTreasury,
            baseQuoteToken,
            name,
            symbol,
            code,
            metadataURI,
            referencePrice
        );
        quoteAssetAddress = address(quoteAsset);
        quoteAssets.push(quoteAssetAddress);
        isQuoteAsset[quoteAssetAddress] = true;
        quoteByCode[codeHash] = quoteAssetAddress;
        emit QuoteAssetCreated(
            quoteAssetAddress,
            msg.sender,
            code,
            name,
            symbol,
            referencePrice,
            metadataURI
        );
    }

    function createMarket(
        address quoteToken,
        string calldata name,
        string calldata symbol,
        string calldata unit,
        string calldata metadataURI,
        uint256 initialPrice,
        uint256 slope,
        uint256 maxSupply,
        uint16 creatorFeeBps
    ) external returns (address marketAddress, address tokenAddress) {
        if (quoteToken != baseQuoteToken && !isQuoteAsset[quoteToken]) revert InvalidQuoteToken();
        DenomMarket market = new DenomMarket(
            msg.sender,
            platformTreasury,
            quoteToken,
            name,
            symbol,
            unit,
            metadataURI,
            initialPrice,
            slope,
            maxSupply,
            creatorFeeBps
        );
        marketAddress = address(market);
        tokenAddress = address(market.token());
        markets.push(marketAddress);
        isMarket[marketAddress] = true;
        creatorMarkets[msg.sender].push(marketAddress);
        emit MarketCreated(
            marketAddress,
            tokenAddress,
            msg.sender,
            quoteToken,
            unit,
            name,
            symbol,
            metadataURI
        );
    }

    function marketCount() external view returns (uint256) {
        return markets.length;
    }

    function quoteAssetCount() external view returns (uint256) {
        return quoteAssets.length;
    }

    function marketsByCreator(address creator) external view returns (address[] memory) {
        return creatorMarkets[creator];
    }
}

contract MockQuoteToken {
    string public name;
    string public symbol;
    uint8 public immutable decimals;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);

    constructor(string memory name_, string memory symbol_, uint8 decimals_) {
        name = name_;
        symbol = symbol_;
        decimals = decimals_;
    }

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 permitted = allowance[from][msg.sender];
        require(permitted >= amount, "ALLOWANCE");
        if (permitted != type(uint256).max) allowance[from][msg.sender] = permitted - amount;
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount && to != address(0), "TRANSFER");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
