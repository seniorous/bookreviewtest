/**
 * 请求体验证中间件
 * 使用 celebrate + joi 进行统一验证
 */

const { celebrate, Joi, Segments } = require('celebrate');

/**
 * 认证相关验证规则
 */
const auth = {
  // 用户注册
  register: celebrate({
    [Segments.BODY]: Joi.object({
      email: Joi.string()
        .email()
        .required()
        .messages({
          'string.email': '请输入有效的邮箱地址',
          'any.required': '邮箱为必填项'
        }),
      username: Joi.string()
        .min(2)
        .max(20)
        .required()
        .messages({
          'string.min': '用户名至少2个字符',
          'string.max': '用户名最多20个字符',
          'any.required': '用户名为必填项'
        }),
      password: Joi.string()
        .min(8)
        .max(64)
        .pattern(/^(?=.*[a-zA-Z])(?=.*\d).+$/)
        .required()
        .messages({
          'string.min': '密码至少8个字符',
          'string.max': '密码最多64个字符',
          'string.pattern.base': '密码必须包含字母和数字',
          'any.required': '密码为必填项'
        }),
      bio: Joi.string()
        .allow('', null)
        .max(200)
        .messages({
          'string.max': '个人简介最多200个字符'
        })
    })
  }),

  // 用户登录
  login: celebrate({
    [Segments.BODY]: Joi.object({
      email: Joi.string()
        .email()
        .required()
        .messages({
          'string.email': '请输入有效的邮箱地址',
          'any.required': '邮箱为必填项'
        }),
      password: Joi.string()
        .required()
        .messages({
          'any.required': '密码为必填项'
        })
    })
  }),

  // 修改密码
  changePassword: celebrate({
    [Segments.BODY]: Joi.object({
      currentPassword: Joi.string().required(),
      newPassword: Joi.string()
        .min(8)
        .max(64)
        .pattern(/^(?=.*[a-zA-Z])(?=.*\d).+$/)
        .required()
        .messages({
          'string.min': '新密码至少8个字符',
          'string.max': '新密码最多64个字符',
          'string.pattern.base': '新密码必须包含字母和数字'
        })
    })
  }),

  // 更新资料
  updateProfile: celebrate({
    [Segments.BODY]: Joi.object({
      username: Joi.string().min(2).max(20),
      bio: Joi.string().allow('', null).max(200),
      avatar_url: Joi.string().uri().allow('', null)
    }).min(1)
  })
};

/**
 * 书籍相关验证规则
 */
const books = {
  // 创建书籍
  create: celebrate({
    [Segments.BODY]: Joi.object({
      title: Joi.string()
        .max(255)
        .required()
        .messages({
          'any.required': '书名为必填项',
          'string.max': '书名最多255个字符'
        }),
      author: Joi.string()
        .max(255)
        .required()
        .messages({
          'any.required': '作者为必填项',
          'string.max': '作者名最多255个字符'
        }),
      isbn: Joi.string()
        .allow('', null)
        .max(20),
      cover_url: Joi.string()
        .uri()
        .allow('', null)
        .messages({
          'string.uri': '封面URL格式不正确'
        }),
      description: Joi.string()
        .allow('', null),
      publish_year: Joi.number()
        .integer()
        .min(1000)
        .max(9999)
        .allow(null)
        .messages({
          'number.min': '出版年份不能早于1000年',
          'number.max': '出版年份不能超过9999年'
        }),
      publisher: Joi.string()
        .allow('', null)
        .max(255)
    })
  }),

  // 更新书籍
  update: celebrate({
    [Segments.PARAMS]: Joi.object({
      id: Joi.number().integer().required()
    }),
    [Segments.BODY]: Joi.object({
      title: Joi.string().max(255),
      author: Joi.string().max(255),
      isbn: Joi.string().allow('', null).max(20),
      cover_url: Joi.string().uri().allow('', null),
      description: Joi.string().allow('', null),
      publish_year: Joi.number().integer().min(1000).max(9999).allow(null),
      publisher: Joi.string().allow('', null).max(255)
    }).min(1)
  }),

  // 删除书籍
  delete: celebrate({
    [Segments.PARAMS]: Joi.object({
      id: Joi.number().integer().required()
    })
  }),

  // 搜索书籍
  search: celebrate({
    [Segments.QUERY]: Joi.object({
      q: Joi.string().required(),
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(20)
    })
  })
};

/**
 * 书评相关验证规则
 */
const reviews = {
  // 创建书评
  create: celebrate({
    [Segments.BODY]: Joi.object({
      book_id: Joi.number()
        .integer()
        .required()
        .messages({
          'any.required': '书籍ID为必填项'
        }),
      title: Joi.string()
        .max(255)
        .required()
        .messages({
          'any.required': '书评标题为必填项',
          'string.max': '标题最多255个字符'
        }),
      content: Joi.string()
        .required()
        .messages({
          'any.required': '书评内容为必填项'
        }),
      rating: Joi.number()
        .integer()
        .min(1)
        .max(5)
        .required()
        .messages({
          'any.required': '评分为必填项',
          'number.min': '评分最低为1分',
          'number.max': '评分最高为5分'
        })
    })
  }),

  // 更新书评
  update: celebrate({
    [Segments.PARAMS]: Joi.object({
      id: Joi.number().integer().required()
    }),
    [Segments.BODY]: Joi.object({
      title: Joi.string().max(255),
      content: Joi.string(),
      rating: Joi.number().integer().min(1).max(5)
    }).min(1)
  }),

  // 删除书评
  delete: celebrate({
    [Segments.PARAMS]: Joi.object({
      id: Joi.number().integer().required()
    })
  })
};

/**
 * 评论相关验证规则
 */
const comments = {
  // 创建评论
  create: celebrate({
    [Segments.PARAMS]: Joi.object({
      reviewId: Joi.number().integer().required()
    }),
    [Segments.BODY]: Joi.object({
      content: Joi.string()
        .required()
        .max(1000)
        .messages({
          'any.required': '评论内容为必填项',
          'string.max': '评论最多1000个字符'
        }),
      parent_id: Joi.number().integer().allow(null)
    })
  }),

  // 回复评论
  reply: celebrate({
    [Segments.PARAMS]: Joi.object({
      id: Joi.number().integer().required()
    }),
    [Segments.BODY]: Joi.object({
      content: Joi.string()
        .required()
        .max(1000)
        .messages({
          'any.required': '回复内容为必填项',
          'string.max': '回复最多1000个字符'
        })
    })
  })
};

module.exports = {
  auth,
  books,
  reviews,
  comments
};

