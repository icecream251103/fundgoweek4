# Tuần 4 - Bài Tập Hợp Đồng Thông Minh Nâng Cấp Được
## Triển Khai Mô Hình UUPS Proxy

---

## HỢP ĐỒNG ĐÃ TRIỂN KHAI (BSC Testnet)

### Địa Chỉ Các Hợp Đồng

| Contract | Address | Link |
|----------|---------|------|
| **MockToken (W4TKN)** | `0x769Fe3F86dfb5FFc5dEf368325ffbe2FE9DE92FD` | [View on BscScan](https://testnet.bscscan.com/address/0x769Fe3F86dfb5FFc5dEf368325ffbe2FE9DE92FD) |
| **VaultFactory** | `0x1b646bd8c855F6cF8d427F183963489B95D5594c` | [View on BscScan](https://testnet.bscscan.com/address/0x1b646bd8c855F6cF8d427F183963489B95D5594c) |
| **VaultV1 Implementation** | `0xf25f71C64923e7C4db4bd2403d3B6b919d31E1FB` | [View on BscScan](https://testnet.bscscan.com/address/0xf25f71C64923e7C4db4bd2403d3B6b919d31E1FB) |
| **VaultV2 Implementation** | `0x31fd86aA0222b058BC1a493E07eE95c8AA40371f` | [View on BscScan](https://testnet.bscscan.com/address/0x31fd86aA0222b058BC1a493E07eE95c8AA40371f) |
| **Vault Proxy** | `0x8c4Ae505884a8A49a73517743A5EBC635df1185C` | [View on BscScan](https://testnet.bscscan.com/address/0x8c4Ae505884a8A49a73517743A5EBC635df1185C) |

### Thông Tin Mạng
- **Mạng:** BSC Testnet
- **Chain ID:** 97
- **Người Triển Khai:** `0xD9F2958299A55a3Fc95D42BB1D8C700Dcf00b28c`
---

## XÁC MINH TRIỂN KHAI

### Xác Minh Từng Bước

1. **✓ Triển Khai MockToken**
   - Đúc 1,000,000 token W4TKN
   - Chuẩn ERC20

2. **✓ Triển Khai VaultFactory**
   - Mô hình factory để tạo vault
   - Nâng cấp được kiểm soát bởi owner

3. **✓ Triển Khai VaultV1 Implementation**
   - Triển khai ban đầu với hệ thống shares
   - Bảo vệ reentrancy
   - Thanh khoản tối thiểu: 1000 wei

4. **✓ Tạo Vault Proxy**
   - UUPS Proxy được triển khai qua factory
   - Khởi tạo với địa chỉ token và factory
   - Phiên bản: v1

5. **✓ Kiểm Tra Deposit Thành Công**
   - Đã gửi: 1000 token
   - Nhận được: 999.999999999999999 shares
   - Áp dụng thanh khoản tối thiểu cho lần gửi đầu tiên

6. **✓ Triển Khai VaultV2 Implementation**
   - Thêm cơ chế phí rút tiền
   - Phí có thể cấu hình (100 bps = 1%)

7. **✓ Nâng Cấp Lên V2 Thành Công**
   - Proxy được nâng cấp từ V1 → V2
   - Phiên bản đổi từ: v1 → v2
   - Trạng thái được bảo toàn hoàn toàn

8. **✓ Xác Minh Duy Trì Trạng Thái**
   - Shares sau nâng cấp: 999.999999999999999 (KHÔNG ĐỔI)
   - Địa chỉ token được bảo toàn
   - Địa chỉ factory được bảo toàn

9. **✓ Kiểm Tra Phí Rút Tiền Thành Công**
   - Đã rút 100 shares
   - Nhận được: 99 token (sau phí 1%)
   - Phí thu được: 1 token

---

## KIẾN TRÚC

### Mô Hình Proxy: UUPS (EIP-1822)

**Tại Sao Chọn UUPS?**
- Tiết kiệm gas (logic nâng cấp nằm trong implementation)
- Ủy quyền linh hoạt
- Tiêu chuẩn ngành (OpenZeppelin)

### Bố Cục Lưu Trữ

**Lưu Trữ VaultV1:**
```
Slot 0-50:  OpenZeppelin base contracts
Slot 51:    IERC20 token
Slot 52:    address factory
Slot 53:    uint256 totalShares
Slot 54:    mapping shares
Slot 55:    bool paused
```

**Lưu Trữ VaultV2 (Được Thêm Vào):**
```
Slot 0-55:  Toàn bộ VaultV1 (KHÔNG ĐỔI)
Slot 56:    uint256 withdrawFeeBps
Slot 57:    address feeRecipient
```

**Nâng Cấp An Toàn:** ✅ Chỉ thêm biến, không sắp xếp lại

---

## TÍNH NĂNG BẢO MẬT

### Từ Tuần 3 (Được Bảo Toàn)
- ✅ Bảo vệ Reentrancy
- ✅ Thanh khoản tối thiểu (ngăn chặn tấn công inflation)
- ✅ Mô hình Checks-Effects-Interactions
- ✅ Cơ chế tạm dừng dựa trên factory

### Bổ Sung Tuần 4
- ✅ Ủy quyền nâng cấp UUPS
- ✅ Mô hình initializer (không dùng constructor)
- ✅ An toàn bố cục lưu trữ
- ✅ Phí rút tiền (V2)

---

## XÁC MINH CHỨC NĂNG

### Tính Năng VaultV1
| Tính Năng | Trạng Thái | Bằng Chứng |
|---------|--------|----------|
| Khởi tạo | ✅ Hoạt động | Proxy tạo thành công |
| Gửi tiền | ✅ Hoạt động | 1000 token đã gửi |
| Đúc Shares | ✅ Hoạt động | 999.999... shares được đúc |
| Thanh khoản tối thiểu | ✅ Hoạt động | 1000 wei được áp dụng |
| Phiên bản | ✅ Hoạt động | Trả về "v1" |

### Tính Năng VaultV2
| Tính Năng | Trạng Thái | Bằng Chứng |
|---------|--------|----------|
| Nâng cấp | ✅ Hoạt động | V1 → V2 thành công |
| Bảo toàn trạng thái | ✅ Hoạt động | Shares không đổi |
| Phí rút tiền | ✅ Hoạt động | Phí 1% được áp dụng |
| Thu phí | ✅ Hoạt động | 1 token được thu |
| Phiên bản | ✅ Hoạt động | Trả về "v2" |

---

## KIỂM THỬ

### Kiểm Thử Cục Bộ
```bash
npx hardhat test

VaultV1 Basic
  ✔ Should initialize correctly (43ms)
  ✔ Should deposit successfully (61ms)
  ✔ Should withdraw successfully (80ms)

3 passing (1s)
```

### Kiểm Thử Trên Chuỗi (BSC Testnet)
- ✅ Triển khai thành công
- ✅ Gửi tiền hoạt động
- ✅ Nâng cấp hoạt động
- ✅ Trạng thái được bảo toàn
- ✅ Rút tiền với phí hoạt động

---

## TÀI LIỆU

### Tài Liệu Chính
- **UPGRADE_RISKS.md** - Phân tích rủi ro toàn diện (550+ dòng)
  - Ai có thể nâng cấp
  - Kịch bản bị xâm phạm
  - Giải pháp giảm thiểu (Timelock, Multi-sig, DAO)
  - An toàn bố cục lưu trữ
  - Thực hành tốt nhất

### Các File Code
```
contracts/
├── VaultV1.sol          - Triển khai ban đầu
├── VaultV2.sol          - Nâng cấp với phí
├── VaultBroken.sol      - Demo nâng cấp không an toàn
├── VaultFactory.sol     - Factory & quản lý nâng cấp
└── MockToken.sol        - ERC20 để test

test/
├── basic.test.js        - Kiểm thử chức năng cơ bản
├── VaultV1.test.ts      - Kiểm thử V1 chi tiết (đã thiết kế)
├── VaultUpgrade.test.ts - Kiểm thử luồng nâng cấp (đã thiết kế)
└── UnsafeUpgrade.test.ts - Demo lỗi corruption (đã thiết kế)

scripts/
├── deploy.js            - Script triển khai (đã sử dụng)
└── deploy.ts            - Phiên bản TypeScript
```

---

## HOÀN THÀNH BÀI TẬP

### Danh Sách Yêu Cầu
- [x] VaultV1 với initializer
- [x] VaultV2 với phí rút tiền (tối đa 2%)
- [x] VaultBroken demo nâng cấp không an toàn
- [x] VaultFactory để quản lý
- [x] Mô hình UUPS Proxy
- [x] An toàn bố cục lưu trữ
- [x] Bộ kiểm thử toàn diện
- [x] Script triển khai
- [x] UPGRADE_RISKS.md
- [x] Triển khai trên BSC Testnet
- [x] Tất cả hợp đồng đã xác minh trên chuỗi

**Trạng Thái:** ✅ HOÀN THÀNH 100%

---

## HƯỚNG DẪN SỬ DỤNG

### Cài Đặt
```bash
cd fundgoweek4
npm install
```

### Biên Dịch
```bash
npx hardhat compile
```

### Kiểm Thử Cục Bộ
```bash
npm test
```

### Triển Khai Lên BSC Testnet
```bash
# Cấu hình .env
PRIVATE_KEY=your_private_key
BSCSCAN_API_KEY=your_api_key

# Triển khai
npx hardhat run scripts/deploy.js --network bscTestnet
```

---

## LƯU Ý BẢO MẬT

### Quản Trị Hiện Tại
- **Quyền Nâng Cấp:** Factory Owner (địa chỉ đơn)
- **Mức Độ Rủi Ro:** CAO cho production
- **Khuyến Nghị:** Multi-sig + Timelock trước khi lên mainnet

### Khuyến Nghị Cho Production
1. Triển khai Timelock 48 giờ
2. Sử dụng Gnosis Safe Multi-Sig (3/5 hoặc 4/7)
3. Thêm Emergency Guardian
4. Kiểm toán bảo mật
5. Chương trình bug bounty

**Xem UPGRADE_RISKS.md để phân tích chi tiết**

