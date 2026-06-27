import type { ThemeConfig } from 'antd'

/**
 * Light 主题 - 暖色调设计
 * 基于 design_sense 的暖色调色板
 */
export const lightTheme: ThemeConfig = {
  token: {
    // 主色调 - 暖色土色
    colorPrimary: '#C4612F',
    colorLink: '#C4612F',
    colorSuccess: '#52c41a',
    colorWarning: '#faad14',
    colorError: '#ff4d4f',
    colorInfo: '#C4612F',

    // 背景色 - 暖色奶油色
    colorBgLayout: '#F7F4EF',
    colorBgContainer: '#FBF9F5',
    colorBgElevated: '#FFFFFF',
    colorBgSpotlight: '#1F2421', // Tooltip 背景：深色配白字，确保浅色模式可读

    // 边框色 - 暖色调灰
    colorBorder: '#E7E1D7',
    colorBorderSecondary: '#E7E1D7',

    // 文本色
    colorText: '#1F2421',
    colorTextSecondary: '#5C635D',
    colorTextTertiary: '#8C918D',
    colorTextQuaternary: '#BFBFBF',

    // 间距
    margin: 16,
    marginLG: 24,
    marginXL: 32,
    padding: 16,
    paddingLG: 24,
    paddingXL: 32,

    // 圆角
    borderRadius: 6,
    borderRadiusLG: 8,
    borderRadiusSM: 4,

    // 字体
    fontSize: 14,
    fontSizeHeading1: 38,
    fontSizeHeading2: 30,
    fontSizeHeading3: 24,
    fontSizeHeading4: 20,
    fontSizeHeading5: 16,

    // 阴影 - 柔和的暖色调阴影
    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 6px -1px rgba(0, 0, 0, 0.02)',
    boxShadowSecondary: '0 1px 4px 0 rgba(0, 0, 0, 0.05)',
  },
  components: {
    Layout: {
      headerBg: '#FFFFFF',
      bodyBg: '#F7F4EF',
      siderBg: '#1F2421',
    },
    Menu: {
      darkItemBg: '#1F2421',
      darkItemSelectedBg: '#C4612F',
      darkItemHoverBg: 'rgba(196, 97, 47, 0.2)',
    },
    Card: {
      colorBgContainer: '#FBF9F5',
      boxShadowTertiary: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
    },
    Table: {
      headerBg: '#FBF9F5',
      rowHoverBg: '#F2E3D6',
    },
    Button: {
      primaryColor: '#FFFFFF',
      defaultBg: '#FFFFFF',
      defaultBorderColor: '#E7E1D7',
      defaultHoverBg: '#FBF9F5',
      defaultHoverBorderColor: '#C4612F',
    },
    Input: {
      colorBgContainer: '#FFFFFF',
      activeBorderColor: '#C4612F',
      hoverBorderColor: '#C4612F',
    },
    Select: {
      colorBgContainer: '#FFFFFF',
    },
    Tag: {
      defaultBg: '#F2E3D6',
      defaultColor: '#C4612F',
    },
    Alert: {
      colorInfoBg: '#F2E3D6',
      colorInfoBorder: '#E7E1D7',
    },
  },
}

/**
 * Dark 主题 - 暖色调深色模式
 */
export const darkTheme: ThemeConfig = {
  token: {
    // 主色调 - 暖橙色（在深色背景上更明亮）
    colorPrimary: '#D97845',
    colorLink: '#D97845',
    colorSuccess: '#49aa19',
    colorWarning: '#d89614',
    colorError: '#d32029',
    colorInfo: '#D97845',

    // 背景色 - 暖色调深色
    colorBgLayout: '#1A1614',
    colorBgContainer: '#2A2420',
    colorBgElevated: '#3C3835',
    colorBgSpotlight: '#4A4542',

    // 边框色 - 暖灰
    colorBorder: '#4A4542',
    colorBorderSecondary: '#3C3835',

    // 文本色 - 暖白
    colorText: '#E8E6E3',
    colorTextSecondary: '#B8B3AE',
    colorTextTertiary: '#8C8680',
    colorTextQuaternary: '#6A6560',

    // 间距
    margin: 16,
    marginLG: 24,
    marginXL: 32,
    padding: 16,
    paddingLG: 24,
    paddingXL: 32,

    // 圆角
    borderRadius: 6,
    borderRadiusLG: 8,
    borderRadiusSM: 4,

    // 字体
    fontSize: 14,
    fontSizeHeading1: 38,
    fontSizeHeading2: 30,
    fontSizeHeading3: 24,
    fontSizeHeading4: 20,
    fontSizeHeading5: 16,

    // 阴影 - 深色模式柔和阴影
    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.2), 0 1px 6px -1px rgba(0, 0, 0, 0.15)',
    boxShadowSecondary: '0 1px 4px 0 rgba(0, 0, 0, 0.25)',
  },
  components: {
    Layout: {
      headerBg: '#2A2420',
      bodyBg: '#1A1614',
      siderBg: '#0F0D0B',
    },
    Menu: {
      darkItemBg: '#0F0D0B',
      darkItemSelectedBg: '#D97845',
      darkItemHoverBg: 'rgba(217, 120, 69, 0.2)',
    },
    Card: {
      colorBgContainer: '#2A2420',
      boxShadowTertiary: '0 1px 2px 0 rgba(0, 0, 0, 0.2)',
    },
    Table: {
      headerBg: '#2A2420',
      rowHoverBg: '#3C3835',
    },
    Button: {
      primaryColor: '#1A1614',
      defaultBg: '#3C3835',
      defaultBorderColor: '#4A4542',
      defaultHoverBg: '#4A4542',
      defaultHoverBorderColor: '#D97845',
    },
    Input: {
      colorBgContainer: '#3C3835',
      activeBorderColor: '#D97845',
      hoverBorderColor: '#D97845',
    },
    Select: {
      colorBgContainer: '#3C3835',
    },
    Tag: {
      defaultBg: '#3C3835',
      defaultColor: '#D97845',
    },
    Alert: {
      colorInfoBg: '#3C3835',
      colorInfoBorder: '#4A4542',
      colorWarningBg: '#4A3820',
      colorWarningBorder: '#6B5230',
    },
  },
}
